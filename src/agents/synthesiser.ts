import Anthropic from "@anthropic-ai/sdk";
import { BriefingSchema, type Briefing, type CaseRow, type Evidence, type Gap, type TraceEvent } from "../state/types.js";
import { env } from "../config/env.js";
import { extractDataPoints } from "./identity.js";

const MODEL = "claude-sonnet-4-5-20250929";

const SYSTEM_PROMPT = `You are the Briefing Synthesiser for a debt-recovery OSINT agent used by a European debt servicer.

You are given:
  (1) a case row (debtor name, country, debt context, prior call outcome, prior asset-report outcome, plus available data points like DNI, email, employer, etc.)
  (2) an Evidence[] array — every item has { id, url, snippet, source, signal_type, identity_match_score, matched_data_points, pairing_confidence }
  (3) a Gaps[] array — honest records of what the agent tried and failed to find
  (4) available_data_points — which debtor data fields were provided for searching

IDENTITY CONFIDENCE via DATA-POINT PAIRING:
  Evidence items now carry "matched_data_points" (which debtor fields were found on the page) and "pairing_confidence":
  • "very_high" — DNI + another field found together (near-certain identity match)
  • "high" — phone/email/employer + another field found together
  • "medium" — 2+ weaker fields found together (city, provincia, etc.)
  • "low" — name-only match or no match
  Prioritize very_high and high confidence evidence. Low confidence evidence should be treated as uncertain.

YOUR RULES — violating any is a disqualifying hallucination:
  • Every factual claim in "findings" MUST cite ≥1 evidence_id drawn from the supplied Evidence[] array. If you cannot cite, DO NOT make the claim.
  • Do not fabricate names, dates, companies, or URLs. Only restate what the evidence snippet supports.
  • If evidence is thin, say so in "overall_confidence" and reflect it in "gaps".
  • Tailor "negotiation_angles" to the debt context AND confidence level:
    - High/very_high confidence evidence → more assertive angles ("We know you work at X", "BOE records show...")
    - Low confidence → softer angles, focus on debt resolution rather than specific claims
  • signal_type can be: "employment", "business", "asset", "social", "news", "legal", "registry", "subsidy", "other"
  • Output MUST be valid JSON matching the provided schema — no prose outside JSON.

JSON schema:
{
  "case_id": string,
  "summary": string (1-3 sentences, what we learned overall),
  "findings": [{"claim": string, "evidence_ids": [string,...], "signal_type": "employment"|"business"|"asset"|"social"|"news"|"legal"|"registry"|"subsidy"|"other", "confidence": "low"|"medium"|"high"}],
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

  const availableDataPoints = extractDataPoints(row).map((dp) => dp.field);

  const userPayload = {
    case: row,
    available_data_points: availableDataPoints,
    evidence: evidence.map((e) => ({
      id: e.id,
      url: e.url,
      source: e.source,
      title: e.title,
      snippet: e.snippet,
      signal_type: e.signal_type,
      identity_match_score: Number(e.identity_match_score.toFixed(2)),
      matched_data_points: e.matched_data_points,
      pairing_confidence: e.pairing_confidence,
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

  const findings = [...topBySignal.values()].map((e) => {
    const pairingInfo = e.matched_data_points.length > 1
      ? ` [paired: ${e.matched_data_points.join("+")}]`
      : "";
    return {
      claim: `Possible ${e.signal_type} signal at ${e.source}: "${e.snippet.slice(0, 140)}"${pairingInfo}`,
      evidence_ids: [e.id],
      signal_type: e.signal_type,
      confidence: e.pairing_confidence === "very_high" || e.pairing_confidence === "high"
        ? ("high" as const)
        : e.identity_match_score >= 0.55
          ? ("medium" as const)
          : ("low" as const),
    };
  });

  const highConfCount = evidence.filter((e) => e.pairing_confidence === "high" || e.pairing_confidence === "very_high").length;

  return {
    case_id: row.case_id,
    summary: `Heuristic briefing (no LLM). ${evidence.length} evidence items across ${topBySignal.size} signal types. ${highConfCount} high-confidence paired matches.`,
    findings,
    negotiation_angles: [
      `Debt profile: €${row.debt_eur} ${row.debt_origin}, ${row.debt_age_months}mo old, ${row.call_attempts} prior calls (${row.call_outcome}).`,
    ],
    gaps,
    overall_confidence: highConfCount >= 2 ? "high" : findings.length >= 2 ? "medium" : "low",
    generated_at: new Date().toISOString(),
  };
}
