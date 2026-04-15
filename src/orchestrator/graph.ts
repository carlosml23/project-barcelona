import type { CaseRow, CaseState } from "../state/types.js";
import { runSearchFanOut } from "../agents/search.js";
import { verifyEvidence } from "../agents/verifier.js";
import { synthesise } from "../agents/synthesiser.js";
import { store } from "../state/store.js";

export interface RunOptions {
  persist?: boolean;
  onTrace?: (msg: string) => void;
}

export async function runCase(row: CaseRow, opts: RunOptions = {}): Promise<CaseState> {
  const { persist = true, onTrace } = opts;
  if (persist) store.saveCase(row);

  const log = (m: string): void => onTrace?.(m);

  log(`[orchestrator] fan-out for ${row.full_name} (${row.country})`);
  const search = await runSearchFanOut(row);
  for (const t of search.trace) log(`[${t.agent}:${t.kind}] ${t.message}`);

  log(`[verifier] scoring ${search.evidence.length} hits`);
  const verified = verifyEvidence(row.case_id, search.evidence);
  for (const t of verified.trace) log(`[${t.agent}:${t.kind}] ${t.message}`);

  log(`[synthesiser] building briefing from ${verified.kept.length} kept evidence`);
  const synth = await synthesise(row, verified.kept, verified.gaps);
  for (const t of synth.trace) log(`[${t.agent}:${t.kind}] ${t.message}`);

  const fullTrace = [...search.trace, ...verified.trace, ...synth.trace];

  if (persist) {
    for (const e of search.evidence) store.saveEvidence(e);
    for (const t of fullTrace) store.saveTrace(t);
    store.saveBriefing(synth.briefing);
  }

  return {
    case: row,
    evidence: verified.kept,
    trace: fullTrace,
    briefing: synth.briefing,
  };
}
