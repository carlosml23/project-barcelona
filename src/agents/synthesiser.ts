import Anthropic from "@anthropic-ai/sdk";
import { BriefingSchema, type Briefing, type CaseRow, type Evidence, type Gap, type TraceEvent } from "../state/types.js";
import { env } from "../config/env.js";

const MODEL = "claude-sonnet-4-5-20250929";

const SYSTEM_PROMPT = `You are the Briefing Synthesiser for a debt-recovery OSINT agent used by a European debt servicer.

You are given:
  (1) a case row (debtor name, country, debt context, prior call outcome, prior asset-report outcome)
  (2) an Evidence[] array — every item has { id, url, snippet, source, signal_type, identity_match_score }
  (3) a Gaps[] array — honest records of what the agent tried and failed to find

YOUR RULES — violating any is a disqualifying hallucination:
  • Every factual claim in "findings" MUST cite ≥1 evidence_id drawn from the supplied Evidence[] array. If you cannot cite, DO NOT make the claim.
  • Do not fabricate names, dates, companies, or URLs. Only restate what the evidence snippet supports.
  • If evidence is thin, say so in "overall_confidence" and reflect it in "gaps".
  • Tailor "negotiation_angles" to the debt context (amount, age, origin, prior outcome). An old telecom debt €2k vs fresh €21k personal loan call for different angles.
  • Output MUST be valid JSON matching the provided schema — no prose outside JSON.

JSON schema:
{
  "case_id": string,
  "summary": string (1-3 sentences, what we learned overall),
  "findings": [{"claim": string, "evidence_ids": [string,...], "signal_type": "employment"|"business"|"asset"|"social"|"news"|"other", "confidence": "low"|"medium"|"high"}],
  "negotiation_angles": [string, ...],  // 2-4 concrete opening angles for the collector
  "gaps": [{"what_we_tried": string, "why_not_found": string, "sources_checked": [string,...]}],
  "overall_confidence": "low"|"medium"|"high",
  "generated_at": ISO-8601 string
}`;

export interface SynthesiseResult {
  briefing: Briefing;
  trace: TraceEvent[];
}

export async function synthesise(
  row: CaseRow,
  evidence: Evidence[],
  gaps: Gap[],
): Promise<SynthesiseResult> {
  const trace: TraceEvent[] = [];
  const ts = () => new Date().toISOString();

  if (!env.ANTHROPIC_API_KEY) {
    const briefing = heuristicBriefing(row, evidence, gaps);
    trace.push({
      ts: ts(),
      case_id: row.case_id,
      agent: "synthesiser",
      kind: "decision",
      message: "ANTHROPIC_API_KEY missing — emitted heuristic briefing",
    });
    return { briefing, trace };
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const userPayload = {
    case: row,
    evidence: evidence.map((e) => ({
      id: e.id,
      url: e.url,
      source: e.source,
      title: e.title,
      snippet: e.snippet,
      signal_type: e.signal_type,
      identity_match_score: Number(e.identity_match_score.toFixed(2)),
    })),
    gaps,
  };

  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: "synthesiser",
    kind: "tool_call",
    message: `claude.messages.create model=${MODEL} evidence=${evidence.length}`,
  });

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the case payload. Return ONLY the briefing JSON.\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("no text block in Claude response");
  const jsonText = extractJson(textBlock.text);
  const parsed = BriefingSchema.parse(JSON.parse(jsonText));

  const validated = enforceCitations(parsed, evidence);

  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: "synthesiser",
    kind: "decision",
    message: `findings=${validated.findings.length} angles=${validated.negotiation_angles.length} confidence=${validated.overall_confidence}`,
  });

  return { briefing: validated, trace };
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object found in model output");
  return text.slice(start, end + 1);
}

function enforceCitations(b: Briefing, evidence: Evidence[]): Briefing {
  const valid = new Set(evidence.map((e) => e.id));
  const findings = b.findings.filter((f) => f.evidence_ids.every((id) => valid.has(id)));
  return { ...b, findings };
}

function heuristicBriefing(row: CaseRow, evidence: Evidence[], gaps: Gap[]): Briefing {
  const topBySignal = new Map<string, Evidence>();
  for (const e of evidence) {
    const cur = topBySignal.get(e.signal_type);
    if (!cur || e.identity_match_score > cur.identity_match_score) topBySignal.set(e.signal_type, e);
  }
  const findings = [...topBySignal.values()].map((e) => ({
    claim: `Possible ${e.signal_type} signal at ${e.source}: "${e.snippet.slice(0, 140)}"`,
    evidence_ids: [e.id],
    signal_type: e.signal_type,
    confidence: e.identity_match_score >= 0.75 ? ("medium" as const) : ("low" as const),
  }));
  return {
    case_id: row.case_id,
    summary: `Heuristic briefing (no LLM). ${evidence.length} evidence items across ${topBySignal.size} signal types.`,
    findings,
    negotiation_angles: [
      `Debt profile: €${row.debt_eur} ${row.debt_origin}, ${row.debt_age_months}mo old, ${row.call_attempts} prior calls (${row.call_outcome}).`,
    ],
    gaps,
    overall_confidence: findings.length >= 2 ? "medium" : "low",
    generated_at: new Date().toISOString(),
  };
}
