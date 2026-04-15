/**
 * Agentic Discovery Agent — Stage 0 of the pipeline.
 *
 * Uses Claude's built-in server-side web_search + web_fetch tools to broadly
 * discover information about a debtor before the deterministic playbook fan-out.
 *
 * Runs as a single messages.create() call with ONLY server-side tools.
 * Anthropic executes searches/fetches inline — no tool dispatch loop needed.
 * web_search is location-aware (derived from the debtor's country/city/provincia).
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { extractDataPoints, generateNameVariants } from "./identity.js";
import { scoreEvidence } from "../identity/scorer.js";
import {
  buildServerToolDefs,
  extractSearchHitsFromResponse,
  extractTextContent,
  countServerToolUses,
  type ServerToolConfig,
} from "../tools/serverTools.js";
import { newId } from "../util/id.js";
import type { CaseRow, Evidence, TraceEvent } from "../state/types.js";

// ── Configuration ───────────────────────────────────────────────────────────

const DISCOVERY_MODEL = "claude-haiku-4-5-20251001";
const DISCOVERY_MAX_TOKENS = 2000;

// ── Public Interface ────────────────────────────────────────────────────────

export interface DiscoveryResult {
  evidence: Evidence[];
  trace: TraceEvent[];
}

export interface DiscoveryConfig {
  maxSearches?: number;
  maxFetches?: number;
}

// ── Main Function ───────────────────────────────────────────────────────────

export async function discoverEvidence(
  row: CaseRow,
  config?: DiscoveryConfig,
): Promise<DiscoveryResult> {
  const trace: TraceEvent[] = [];
  const ts = () => new Date().toISOString();

  // Guard: skip if no API key or discovery disabled
  if (!env.ANTHROPIC_API_KEY) {
    trace.push({
      ts: ts(), case_id: row.case_id, agent: "discovery",
      kind: "decision", message: "skipped — no ANTHROPIC_API_KEY",
    });
    return { evidence: [], trace };
  }

  if (!env.DISCOVERY_ENABLED) {
    trace.push({
      ts: ts(), case_id: row.case_id, agent: "discovery",
      kind: "decision", message: "skipped — DISCOVERY_ENABLED=false",
    });
    return { evidence: [], trace };
  }

  const maxSearches = config?.maxSearches ?? env.DISCOVERY_MAX_SEARCHES;
  const maxFetches = config?.maxFetches ?? env.DISCOVERY_MAX_FETCHES;

  const serverToolConfig: ServerToolConfig = {
    maxSearches,
    maxFetches,
  };

  trace.push({
    ts: ts(), case_id: row.case_id, agent: "discovery",
    kind: "plan",
    message: `starting agentic discovery: maxSearches=${maxSearches} maxFetches=${maxFetches}`,
  });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const tools = buildServerToolDefs(row, serverToolConfig);
  const systemPrompt = buildDiscoverySystemPrompt(row);
  const userPrompt = buildDiscoveryUserPrompt(row);

  try {
    const response = await client.messages.create({
      model: DISCOVERY_MODEL,
      max_tokens: DISCOVERY_MAX_TOKENS,
      system: systemPrompt,
      tools,
      messages: [{ role: "user", content: userPrompt }],
    });

    const serverToolCount = countServerToolUses(response);
    trace.push({
      ts: ts(), case_id: row.case_id, agent: "discovery",
      kind: "tool_result",
      message: `Claude used ${serverToolCount} server-side tool calls, stop_reason=${response.stop_reason}`,
    });

    // Extract search hits from server-tool result blocks
    const hits = extractSearchHitsFromResponse(response);
    const dataPoints = extractDataPoints(row);

    // Score and convert to Evidence
    const evidence: Evidence[] = hits.map((h) => {
      const text = `${h.title ?? ""} ${h.snippet}`;
      const scoring = scoreEvidence(dataPoints, text, [], h.source);
      const isFromFetch = (h.raw as Record<string, unknown>)?.fetched === true;

      return {
        id: newId("ev_"),
        case_id: row.case_id,
        agent: isFromFetch ? "discovery:web_fetch" : "discovery:web_search",
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

    // Capture Claude's text assessment as a trace
    const assessment = extractTextContent(response);
    if (assessment) {
      trace.push({
        ts: ts(), case_id: row.case_id, agent: "discovery",
        kind: "decision",
        message: `discovery assessment: ${assessment.slice(0, 300)}`,
        data: { fullLength: assessment.length },
      });
    }

    trace.push({
      ts: ts(), case_id: row.case_id, agent: "discovery",
      kind: "decision",
      message: `discovery complete: ${evidence.length} evidence items from ${serverToolCount} tool calls`,
      data: { urls: evidence.map((e) => e.url) },
    });

    return { evidence, trace };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    trace.push({
      ts: ts(), case_id: row.case_id, agent: "discovery",
      kind: "error", message: `discovery failed: ${errMsg}`,
    });
    return { evidence: [], trace };
  }
}

// ── Prompt Construction ─────────────────────────────────────────────────────

function buildDiscoverySystemPrompt(row: CaseRow): string {
  const nameVariants = generateNameVariants(row.full_name);
  const nameVariantsList = nameVariants.length > 1
    ? `\nName variants to search: ${nameVariants.map((v) => `"${v}"`).join(", ")}`
    : "";

  const callOutcomeNote = getCallOutcomeNote(row.call_outcome);

  return `You are a Discovery Agent for a debt-recovery OSINT system.
Your goal is to broadly search the web for information about a debtor.

CASE:
- Debtor: ${row.full_name} (${row.country})${nameVariantsList}
- DNI/NIE: ${row.dni_nie ?? "not available"}
- Phone: ${row.phone ?? "not available"} ${callOutcomeNote}
- Email: ${row.email ?? "not available"}
- Employer: ${row.employer ?? "unknown"}
- Location: ${[row.city, row.provincia].filter(Boolean).join(", ") || "unknown"}

DEBT: €${row.debt_eur} ${row.debt_origin}, ${row.debt_age_months}mo old

SEARCH STRATEGIES (try multiple):
1. Full name + country (try each name variant)
2. Full name + employer
3. Full name + city/location
4. DNI/NIE in official registries (if available)
5. Phone number lookup (if valid)
6. Name + "linkedin" for professional profile
7. Name in news or official gazettes

When you find promising URLs in search results, fetch them to get full content.
Prioritize government registries, business databases, and professional profiles.

OUTPUT: After searching, briefly summarize what you found and what looks most relevant.`;
}

function buildDiscoveryUserPrompt(row: CaseRow): string {
  const fields: string[] = [`Name: ${row.full_name}`, `Country: ${row.country}`];
  if (row.dni_nie) fields.push(`DNI/NIE: ${row.dni_nie}`);
  if (row.phone) fields.push(`Phone: ${row.phone}`);
  if (row.email) fields.push(`Email: ${row.email}`);
  if (row.employer) fields.push(`Employer: ${row.employer}`);
  if (row.city) fields.push(`City: ${row.city}`);
  if (row.provincia) fields.push(`Provincia: ${row.provincia}`);

  return `Search the web for information about this debtor. Use multiple search strategies and fetch promising pages.

${fields.join("\n")}

Find: employment records, business ownership, property records, social profiles, government gazette mentions, news articles, any public information that could help a debt collector.`;
}

function getCallOutcomeNote(outcome: string): string {
  switch (outcome) {
    case "invalid_number": return "⚠ INVALID — skip phone searches";
    case "wrong_number": return "⚠ WRONG NUMBER — phone unreliable";
    default: return "";
  }
}
