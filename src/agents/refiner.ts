/**
 * Agentic Refinement Loop — adapted from Claude Code's queryLoop pattern.
 *
 * After the deterministic playbook fan-out, this module gives Claude the
 * gathered evidence and lets it decide whether to run additional targeted
 * searches. The loop follows the standard tool-use protocol:
 *
 *   while (budget remains) {
 *     send(evidence + gaps) → Claude responds with tool_use blocks
 *     → dispatch tools concurrently → collect tool_result
 *     → append to messages → repeat
 *   }
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { extractDataPoints, generateNameVariants } from "./identity.js";
import { scoreEvidence } from "../identity/scorer.js";
import { findToolByName, registryToAnthropicTools } from "../tools/registry.js";
import {
  buildServerToolDefs,
  isServerToolResultBlock,
  extractSearchHitsFromResponse,
  countServerToolUses,
} from "../tools/serverTools.js";
import { newId } from "../util/id.js";
import type { CaseRow, Evidence, Gap, TraceEvent } from "../state/types.js";

// ── Configuration ────────────────────────────────────────────────────────────

const REFINER_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_MAX_TOOL_CALLS = 6;

// ── Public Interface ─────────────────────────────────────────────────────────

export interface RefinerResult {
  additionalEvidence: Evidence[];
  trace: TraceEvent[];
  iterationsUsed: number;
  toolCallsUsed: number;
}

export interface RefinerConfig {
  maxIterations?: number;
  maxToolCalls?: number;
}

// ── Main Loop ────────────────────────────────────────────────────────────────

export async function refineEvidence(
  row: CaseRow,
  currentEvidence: Evidence[],
  gaps: Gap[],
  config?: RefinerConfig,
): Promise<RefinerResult> {
  const maxIterations = config?.maxIterations ?? envInt("REFINER_MAX_ITERATIONS", DEFAULT_MAX_ITERATIONS);
  const maxToolCalls = config?.maxToolCalls ?? envInt("REFINER_MAX_TOOL_CALLS", DEFAULT_MAX_TOOL_CALLS);

  const trace: TraceEvent[] = [];
  const additionalEvidence: Evidence[] = [];
  const ts = () => new Date().toISOString();
  const dataPoints = extractDataPoints(row);

  // Guard: no API key → skip refinement
  if (!env.ANTHROPIC_API_KEY) {
    trace.push({
      ts: ts(), case_id: row.case_id, agent: "refiner",
      kind: "decision", message: "skipped — no ANTHROPIC_API_KEY",
    });
    return { additionalEvidence, trace, iterationsUsed: 0, toolCallsUsed: 0 };
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const clientTools = registryToAnthropicTools();
  const serverTools = buildServerToolDefs(row, { maxSearches: 3, maxFetches: 2 });
  const tools = [...clientTools, ...serverTools];
  const systemPrompt = buildSystemPrompt(row, currentEvidence, gaps);

  // Initial user message with evidence summary
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserPrompt(row, currentEvidence, gaps) },
  ];

  let totalToolCalls = 0;

  trace.push({
    ts: ts(), case_id: row.case_id, agent: "refiner",
    kind: "plan",
    message: `starting refinement loop: maxIter=${maxIterations} maxTools=${maxToolCalls} evidence=${currentEvidence.length} gaps=${gaps.length}`,
  });

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // ── 1. Send to Claude ────────────────────────────────────────────────
    trace.push({
      ts: ts(), case_id: row.case_id, agent: "refiner",
      kind: "tool_call",
      message: `iteration ${iteration + 1}/${maxIterations} — calling ${REFINER_MODEL}`,
    });

    const response = await client.messages.create({
      model: REFINER_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      tools,
      messages,
    });

    // ── 2. Extract server-side tool results (already executed) ───────────
    const serverToolCount = countServerToolUses(response);
    if (serverToolCount > 0) {
      totalToolCalls += serverToolCount;
      const serverHits = extractSearchHitsFromResponse(response);

      const serverEvidence = serverHits.map((h) => {
        const text = `${h.title ?? ""} ${h.snippet}`;
        const scoring = scoreEvidence(dataPoints, text, [], h.source);
        const isFromFetch = (h.raw as Record<string, unknown>)?.fetched === true;
        return {
          id: newId("ev_"),
          case_id: row.case_id,
          agent: isFromFetch ? "refiner:web_fetch" : "refiner:web_search",
          source: h.source,
          url: h.url,
          title: h.title,
          snippet: h.snippet,
          retrieved_at: h.retrieved_at,
          identity_match_score: scoring.total,
          signal_type: "other" as const,
          matched_data_points: scoring.matchedFields,
          pairing_confidence: scoring.pairingConfidence,
          raw: h.raw,
        };
      });

      additionalEvidence.push(...serverEvidence);
      trace.push({
        ts: ts(), case_id: row.case_id, agent: "refiner",
        kind: "tool_result",
        message: `server tools (web_search/web_fetch) → ${serverEvidence.length} hits from ${serverToolCount} calls`,
        data: { urls: serverEvidence.map((e) => e.url) },
      });
    }

    // ── 3. Check stop condition ──────────────────────────────────────────
    if (response.stop_reason === "end_turn") {
      const textContent = response.content.find((b) => b.type === "text");
      trace.push({
        ts: ts(), case_id: row.case_id, agent: "refiner",
        kind: "decision",
        message: `stopped — model said end_turn`,
        data: { assessment: textContent?.type === "text" ? textContent.text.slice(0, 300) : undefined },
      });
      break;
    }

    // ── 4. Detect client tool_use blocks ─────────────────────────────────
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      trace.push({
        ts: ts(), case_id: row.case_id, agent: "refiner",
        kind: "decision", message: "stopped — no client tool_use blocks in response",
      });
      break;
    }

    // ── 5. Dispatch client tools concurrently ────────────────────────────
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    const toolPromises = toolUseBlocks.map(async (block) => {
      totalToolCalls++;

      if (totalToolCalls > maxToolCalls) {
        trace.push({
          ts: ts(), case_id: row.case_id, agent: "refiner",
          kind: "decision", message: `budget exhausted — skipping ${block.name}`,
        });
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: "Tool call budget exhausted. Provide your assessment with current evidence.",
        };
      }

      const tool = findToolByName(block.name);
      if (!tool) {
        trace.push({
          ts: ts(), case_id: row.case_id, agent: "refiner",
          kind: "error", message: `unknown tool: ${block.name}`,
        });
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: `Error: unknown tool "${block.name}"`,
          is_error: true as const,
        };
      }

      trace.push({
        ts: ts(), case_id: row.case_id, agent: "refiner",
        kind: "tool_call",
        message: `${block.name} ${JSON.stringify(block.input).slice(0, 200)}`,
      });

      try {
        const hits = await tool.call(block.input);

        // Score and convert hits to Evidence
        const newEvidence = hits.map((h) => {
          const text = `${h.title ?? ""} ${h.snippet}`;
          const scoring = scoreEvidence(dataPoints, text, [], h.source);
          return {
            id: newId("ev_"),
            case_id: row.case_id,
            agent: `refiner:${block.name}`,
            source: h.source,
            url: h.url,
            title: h.title,
            snippet: h.snippet,
            retrieved_at: h.retrieved_at,
            identity_match_score: scoring.total,
            signal_type: "other" as const,
            matched_data_points: scoring.matchedFields,
            pairing_confidence: scoring.pairingConfidence,
            raw: h.raw,
          };
        });

        additionalEvidence.push(...newEvidence);

        trace.push({
          ts: ts(), case_id: row.case_id, agent: "refiner",
          kind: "tool_result",
          message: `${block.name} → ${newEvidence.length} hits`,
          data: { urls: newEvidence.map((e) => e.url) },
        });

        // Return summarized results to Claude (not full raw content)
        const summary = newEvidence.map((e) => ({
          url: e.url,
          source: e.source,
          title: e.title,
          snippet: e.snippet.slice(0, 200),
          identity_match_score: e.identity_match_score,
          matched_fields: e.matched_data_points,
        }));

        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: JSON.stringify(summary),
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        trace.push({
          ts: ts(), case_id: row.case_id, agent: "refiner",
          kind: "error", message: `${block.name} failed: ${errMsg}`,
        });
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: `Error: ${errMsg}`,
          is_error: true as const,
        };
      }
    });

    const results = await Promise.all(toolPromises);
    toolResults.push(...results);

    // ── 6. Append tool results to messages ───────────────────────────────
    messages.push({ role: "user", content: toolResults });

    // ── 7. Budget check ──────────────────────────────────────────────────
    if (totalToolCalls >= maxToolCalls) {
      trace.push({
        ts: ts(), case_id: row.case_id, agent: "refiner",
        kind: "decision", message: `stopping — tool call budget reached (${totalToolCalls}/${maxToolCalls})`,
      });
      break;
    }
  }

  trace.push({
    ts: ts(), case_id: row.case_id, agent: "refiner",
    kind: "decision",
    message: `refinement complete: ${additionalEvidence.length} new evidence, ${totalToolCalls} tool calls`,
  });

  return {
    additionalEvidence,
    trace,
    iterationsUsed: Math.min(totalToolCalls, maxIterations),
    toolCallsUsed: totalToolCalls,
  };
}

// ── Prompt Construction ──────────────────────────────────────────────────────

function buildSystemPrompt(row: CaseRow, evidence: Evidence[], gaps: Gap[]): string {
  const callOutcomeNote = getCallOutcomeNote(row.call_outcome);
  const nameVariants = generateNameVariants(row.full_name);
  const nameVariantsList = nameVariants.length > 1
    ? `\n- Name variants to try: ${nameVariants.map((v) => `"${v}"`).join(", ")}`
    : "";

  const highConfCount = evidence.filter(
    (e) => e.pairing_confidence === "high" || e.pairing_confidence === "very_high",
  ).length;

  return `You are the Refinement Agent for a debt-recovery OSINT system.

CASE:
- Debtor: ${row.full_name} (${row.country})${nameVariantsList}
- DNI/NIE: ${row.dni_nie ?? "not available"}
- Phone: ${row.phone ?? "not available"} ${callOutcomeNote}
- Email: ${row.email ?? "not available"}
- Employer: ${row.employer ?? "unknown"}
- Location: ${[row.city, row.provincia].filter(Boolean).join(", ") || "unknown"}

DEBT: €${row.debt_eur} ${row.debt_origin}, ${row.debt_age_months}mo old
Prior calls: ${row.call_attempts} attempts, outcome: ${row.call_outcome}
Legal finding: ${row.legal_asset_finding}

INITIAL SEARCH RESULTS: ${evidence.length} evidence items (${highConfCount} high confidence)
GAPS: ${gaps.length} sources tried with no useful results

YOUR JOB: Make targeted follow-up searches to fill gaps or deepen leads.
${highConfCount === 0 ? "\n⚠ NO HIGH-CONFIDENCE EVIDENCE — you MUST try alternative searches before stopping.\n" : ""}
STRATEGIES (in priority order):
1. NAME VARIANTS — Spanish names are often shortened on social platforms. If initial searches found little, ALWAYS try searching with the shorter name variants listed above (e.g., dropping the middle name). This is the #1 reason for missed LinkedIn/social profiles.
2. LinkedIn/social — search_neural with each name variant + employer/city on linkedin.com
3. Company leads — follow up on company/employer names → search for their property, assets, directors
4. If a BORME hit mentions a company, search for that company's fiscal details
5. If call_outcome is "invalid_number"/"wrong_number", phone data is unreliable — skip phone searches
6. Try DNI in registries not yet searched (BOE, BDNS, provincial bulletins)
7. Scrape specific URLs referenced in evidence snippets
8. web_search — broad web discovery for sources not covered by the targeted tools above
9. web_fetch — retrieve full page content from URLs found in search results (FREE, no cost)

COST GUIDANCE:
- web_fetch is FREE → always prefer over scrape_page for static HTML pages
- web_search costs $0.01/search → use when search_web/search_neural don't cover the source
- scrape_page (Firecrawl) → reserve for JavaScript-heavy pages (LinkedIn SPAs, dynamic registries)

RULES:
- DO NOT repeat searches that already returned results
- DO NOT fabricate queries for data you don't have
- If evidence count is 0 or all low-confidence, you MUST try at least 2 alternative searches

When you have enough evidence or no productive leads remain, STOP and provide a brief assessment.`;
}

function buildUserPrompt(row: CaseRow, evidence: Evidence[], gaps: Gap[]): string {
  const evidenceSummary = evidence
    .map((e) => `- [${e.signal_type}] ${e.source}: "${e.snippet.slice(0, 150)}" (score: ${e.identity_match_score.toFixed(2)}, fields: ${e.matched_data_points.join(", ") || "none"})`)
    .join("\n");

  const gapSummary = gaps
    .map((g) => `- ${g.what_we_tried}: ${g.why_not_found} (checked: ${g.sources_checked.join(", ")})`)
    .join("\n");

  return `Here is the current evidence and gaps. Decide what follow-up searches to run, or stop if you have enough.

EVIDENCE (${evidence.length} items):
${evidenceSummary || "(none)"}

GAPS (${gaps.length}):
${gapSummary || "(none)"}

Use the available tools to fill gaps or deepen leads. When done, provide your assessment.`;
}

function getCallOutcomeNote(outcome: string): string {
  switch (outcome) {
    case "invalid_number": return "⚠ INVALID NUMBER — do not use phone for searches";
    case "wrong_number": return "⚠ WRONG NUMBER — phone belongs to someone else";
    case "not_debtor": return "⚠ NOT DEBTOR — person who answered is not the debtor";
    case "busy": return "(busy — phone may be valid)";
    case "rings_out": return "(rings out — phone may be valid)";
    case "voicemail": return "(voicemail — phone likely valid)";
    default: return "";
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
