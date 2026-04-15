import type { CaseRow, CaseState, Evidence, Gap } from "../state/types.js";
import { runSearchFanOut } from "../agents/search.js";
import { verifyEvidence } from "../agents/verifier.js";
import { refineEvidence } from "../agents/refiner.js";
import { synthesise } from "../agents/synthesiser.js";
import { store } from "../state/store.js";
import { env } from "../config/env.js";

export interface RunOptions {
  persist?: boolean;
  onTrace?: (msg: string) => void;
}

export async function runCase(row: CaseRow, opts: RunOptions = {}): Promise<CaseState> {
  const { persist = true, onTrace } = opts;
  if (persist) store.saveCase(row);

  const log = (m: string): void => onTrace?.(m);

  // ── Stage 1: Deterministic playbook fan-out ──────────────────────────
  log(`[orchestrator] fan-out for ${row.full_name} (${row.country})`);
  const search = await runSearchFanOut(row);
  for (const t of search.trace) log(`[${t.agent}:${t.kind}] ${t.message}`);

  // ── Stage 2: Verify initial evidence ─────────────────────────────────
  log(`[verifier] scoring ${search.evidence.length} hits`);
  const verified = verifyEvidence(row.case_id, search.evidence);
  for (const t of verified.trace) log(`[${t.agent}:${t.kind}] ${t.message}`);

  // ── Stage 3: Agentic refinement (if API key available) ───────────────
  let allEvidence: Evidence[] = verified.kept;
  let allGaps: Gap[] = verified.gaps;
  let refinementTrace = search.trace.concat(verified.trace);

  if (env.ANTHROPIC_API_KEY) {
    log(`[refiner] reviewing ${verified.kept.length} evidence, ${verified.gaps.length} gaps`);
    const refined = await refineEvidence(row, verified.kept, verified.gaps);
    for (const t of refined.trace) log(`[${t.agent}:${t.kind}] ${t.message}`);
    refinementTrace = refinementTrace.concat(refined.trace);

    if (refined.additionalEvidence.length > 0) {
      log(`[verifier] re-verifying ${refined.additionalEvidence.length} new evidence from refiner`);
      const reVerified = verifyEvidence(row.case_id, refined.additionalEvidence);
      for (const t of reVerified.trace) log(`[${t.agent}:${t.kind}] ${t.message}`);
      refinementTrace = refinementTrace.concat(reVerified.trace);

      allEvidence = [...verified.kept, ...reVerified.kept];
      allGaps = mergeGaps(verified.gaps, reVerified.gaps);
    }
  }

  // ── Stage 4: Synthesise briefing ─────────────────────────────────────
  log(`[synthesiser] building briefing from ${allEvidence.length} evidence (${allGaps.length} gaps)`);
  const synth = await synthesise(row, allEvidence, allGaps);
  for (const t of synth.trace) log(`[${t.agent}:${t.kind}] ${t.message}`);

  const fullTrace = [...refinementTrace, ...synth.trace];

  if (persist) {
    for (const e of search.evidence) store.saveEvidence(e);
    for (const t of fullTrace) store.saveTrace(t);
    store.saveBriefing(synth.briefing);
  }

  return {
    case: row,
    evidence: allEvidence,
    trace: fullTrace,
    briefing: synth.briefing,
  };
}

/** Merge gaps from initial verification and re-verification, deduplicating by agent. */
function mergeGaps(initial: Gap[], additional: Gap[]): Gap[] {
  const seen = new Set(initial.map((g) => g.what_we_tried));
  const merged = [...initial];
  for (const g of additional) {
    if (!seen.has(g.what_we_tried)) {
      merged.push(g);
      seen.add(g.what_we_tried);
    }
  }
  return merged;
}
