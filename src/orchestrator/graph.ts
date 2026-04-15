import type { CaseRow, CaseState, TraceEvent } from "../state/types.js";
import { runSearchFanOut } from "../agents/search.js";
import { verifyEvidence } from "../agents/verifier.js";
import { synthesise } from "../agents/synthesiser.js";
import { store } from "../state/store.js";

export interface RunOptions {
  persist?: boolean;
  onTrace?: (msg: string) => void;
  onTraceEvent?: (evt: TraceEvent) => void;
}

export async function runCase(row: CaseRow, opts: RunOptions = {}): Promise<CaseState> {
  const { persist = true, onTrace, onTraceEvent } = opts;
  if (persist) store.saveCase(row);

  const log = (m: string): void => onTrace?.(m);
  const emit = (t: TraceEvent): void => onTraceEvent?.(t);

  const orchestratorEvent: TraceEvent = {
    ts: new Date().toISOString(),
    case_id: row.case_id,
    agent: "orchestrator",
    kind: "plan",
    message: `fan-out for ${row.full_name} (${row.country})`,
  };
  log(`[orchestrator] fan-out for ${row.full_name} (${row.country})`);
  emit(orchestratorEvent);

  const search = await runSearchFanOut(row);
  for (const t of search.trace) {
    log(`[${t.agent}:${t.kind}] ${t.message}`);
    emit(t);
  }

  const verifierStartEvent: TraceEvent = {
    ts: new Date().toISOString(),
    case_id: row.case_id,
    agent: "verifier",
    kind: "plan",
    message: `scoring ${search.evidence.length} hits`,
  };
  log(`[verifier] scoring ${search.evidence.length} hits`);
  emit(verifierStartEvent);

  const verified = verifyEvidence(row.case_id, search.evidence);
  for (const t of verified.trace) {
    log(`[${t.agent}:${t.kind}] ${t.message}`);
    emit(t);
  }

  const synthStartEvent: TraceEvent = {
    ts: new Date().toISOString(),
    case_id: row.case_id,
    agent: "synthesiser",
    kind: "plan",
    message: `building briefing from ${verified.kept.length} kept evidence (${verified.high_confidence_count} high-confidence)`,
  };
  log(`[synthesiser] building briefing from ${verified.kept.length} kept evidence (${verified.high_confidence_count} high-confidence)`);
  emit(synthStartEvent);

  const synth = await synthesise(row, verified.kept, verified.gaps);
  for (const t of synth.trace) {
    log(`[${t.agent}:${t.kind}] ${t.message}`);
    emit(t);
  }

  const fullTrace = [orchestratorEvent, ...search.trace, verifierStartEvent, ...verified.trace, synthStartEvent, ...synth.trace];

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
