import type { Evidence, Gap, TraceEvent } from "../state/types.js";

const MIN_MATCH = 0.5;

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
    if (e.identity_match_score >= MIN_MATCH) kept.push(e);
    else dropped.push(e);
  }

  const high_confidence_count = kept.filter((e) => e.identity_match_score >= 0.85).length;

  const byAgent = new Map<string, Evidence[]>();
  for (const e of all) {
    const list = byAgent.get(e.agent) ?? [];
    list.push(e);
    byAgent.set(e.agent, list);
  }

  const gaps: Gap[] = [];
  for (const [agent, list] of byAgent) {
    const kept_here = list.filter((e) => e.identity_match_score >= MIN_MATCH);
    if (kept_here.length === 0) {
      const pairsSearched = list.flatMap((e) => e.matched_data_points);
      const uniquePairs = [...new Set(pairsSearched)];
      const pairInfo = uniquePairs.length > 0
        ? ` (matched fields in results: ${uniquePairs.join(", ")})`
        : "";
      gaps.push({
        what_we_tried: agent,
        why_not_found:
          list.length === 0
            ? "no results from source"
            : `${list.length} results returned, none reached data-point pairing confidence ≥ ${MIN_MATCH}${pairInfo}`,
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
    data: { thresholds: { min_match: MIN_MATCH }, high_confidence_count },
  });

  return { kept, dropped, gaps, high_confidence_count, trace };
}
