import type { Evidence, Gap, TraceEvent, PairingConfidence } from "../state/types.js";

const MIN_MATCH = 0.5;

/** Pairing confidence levels that bypass the numeric threshold. */
const ALWAYS_KEEP: ReadonlySet<PairingConfidence> = new Set(["very_high", "high"]);

export interface VerifyResult {
  kept: Evidence[];
  dropped: Evidence[];
  gaps: Gap[];
  high_confidence_count: number;
  trace: TraceEvent[];
}

export function verifyEvidence(case_id: string, all: Evidence[]): VerifyResult {
  const trace: TraceEvent[] = [];
  const ts = new Date().toISOString();

  const kept: Evidence[] = [];
  const dropped: Evidence[] = [];
  for (const e of all) {
    if (shouldKeep(e)) kept.push(e);
    else dropped.push(e);
  }

  const high_confidence_count = kept.filter(
    (e) => e.pairing_confidence === "very_high" || e.pairing_confidence === "high",
  ).length;

  const byAgent = new Map<string, Evidence[]>();
  for (const e of all) {
    const list = byAgent.get(e.agent) ?? [];
    list.push(e);
    byAgent.set(e.agent, list);
  }

  const gaps: Gap[] = [];
  for (const [agent, list] of byAgent) {
    const keptHere = list.filter(shouldKeep);
    if (keptHere.length === 0) {
      const matchedFields = list.flatMap((e) => e.matched_data_points);
      const uniqueFields = [...new Set(matchedFields)];
      const fieldInfo = uniqueFields.length > 0
        ? ` (matched fields: ${uniqueFields.join(", ")})`
        : "";
      gaps.push({
        what_we_tried: agent,
        why_not_found:
          list.length === 0
            ? "no results from source"
            : `${list.length} results, none reached pairing confidence threshold${fieldInfo}`,
        sources_checked: [...new Set(list.map((e) => e.source))],
      });
    }
  }

  trace.push({
    ts,
    case_id,
    agent: "verifier",
    kind: "decision",
    message: `kept=${kept.length} dropped=${dropped.length} gaps=${gaps.length} high_confidence=${high_confidence_count}`,
    data: { thresholds: { min_match: MIN_MATCH, always_keep: [...ALWAYS_KEEP] }, high_confidence_count },
  });

  return { kept, dropped, gaps, high_confidence_count, trace };
}

/**
 * Decide whether to keep evidence based on pairing confidence and score.
 * - very_high / high pairing confidence → always keep (DNI match, name+phone, etc.)
 * - Otherwise → fall back to numeric score threshold
 */
function shouldKeep(e: Evidence): boolean {
  if (ALWAYS_KEEP.has(e.pairing_confidence)) return true;
  return e.identity_match_score >= MIN_MATCH;
}
