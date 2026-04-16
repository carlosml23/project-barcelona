import type { CaseRow, CaseState, CandidateReport, Evidence, Gap, TraceEvent } from "../state/types.js";
import { runSearchFanOut } from "../agents/search.js";
import { discoverEvidence } from "../agents/discovery.js";
import { verifyEvidence } from "../agents/verifier.js";
import { refineEvidence } from "../agents/refiner.js";
import { clusterCandidates } from "../agents/clusterer.js";
import { synthesise } from "../agents/synthesiser.js";
import { store } from "../state/store.js";
import { env } from "../config/env.js";

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

  // ── Stage 0 + 1: Discovery + Fan-out in parallel ─────────────────────
  const shouldRunDiscovery = Boolean(env.ANTHROPIC_API_KEY) && env.DISCOVERY_ENABLED;
  log(`[orchestrator] fan-out for ${row.full_name} (${row.country})${shouldRunDiscovery ? " + agentic discovery" : ""}`);

  const [discoveryResult, searchResult] = await Promise.all([
    shouldRunDiscovery
      ? discoverEvidence(row)
      : Promise.resolve({ evidence: [] as Evidence[], trace: [] }),
    runSearchFanOut(row),
  ]);

  for (const t of discoveryResult.trace) { log(`[${t.agent}:${t.kind}] ${t.message}`); emit(t); }
  for (const t of searchResult.trace) { log(`[${t.agent}:${t.kind}] ${t.message}`); emit(t); }

  // Merge and deduplicate evidence from both stages
  const mergedEvidence = deduplicateEvidence([
    ...discoveryResult.evidence,
    ...searchResult.evidence,
  ]);
  log(`[orchestrator] merged ${mergedEvidence.length} evidence (discovery: ${discoveryResult.evidence.length}, fan-out: ${searchResult.evidence.length})`);

  // ── Stage 2: Verify initial evidence ─────────────────────────────────
  log(`[verifier] scoring ${mergedEvidence.length} hits`);
  const verified = verifyEvidence(row.case_id, mergedEvidence);
  for (const t of verified.trace) { log(`[${t.agent}:${t.kind}] ${t.message}`); emit(t); }

  // ── Stage 3: Agentic refinement (if API key available) ───────────────
  let allEvidence: Evidence[] = verified.kept;
  let allGaps: Gap[] = verified.gaps;
  let refinementTrace = [...discoveryResult.trace, ...searchResult.trace, ...verified.trace];

  if (env.ANTHROPIC_API_KEY) {
    log(`[refiner] reviewing ${verified.kept.length} evidence, ${verified.gaps.length} gaps`);
    const refined = await refineEvidence(row, verified.kept, verified.gaps);
    for (const t of refined.trace) { log(`[${t.agent}:${t.kind}] ${t.message}`); emit(t); }
    refinementTrace = refinementTrace.concat(refined.trace);

    if (refined.additionalEvidence.length > 0) {
      log(`[verifier] re-verifying ${refined.additionalEvidence.length} new evidence from refiner`);
      const reVerified = verifyEvidence(row.case_id, refined.additionalEvidence);
      for (const t of reVerified.trace) { log(`[${t.agent}:${t.kind}] ${t.message}`); emit(t); }
      refinementTrace = refinementTrace.concat(reVerified.trace);

      allEvidence = [...verified.kept, ...reVerified.kept];
      allGaps = mergeGaps(verified.gaps, reVerified.gaps);
    }
  }

  // ── Stage 3.5: Cluster candidates ────────────────────────────────────
  log(`[clusterer] grouping ${allEvidence.length} evidence into candidates`);
  const cluster = await clusterCandidates(row, allEvidence);
  for (const t of cluster.trace) { log(`[${t.agent}:${t.kind}] ${t.message}`); emit(t); }
  refinementTrace = refinementTrace.concat(cluster.trace);

  const { report: candidateReport } = cluster;

  // ── Stage 4: Synthesise briefing ─────────────────────────────────────
  log(`[synthesiser] building briefing from ${allEvidence.length} evidence (${allGaps.length} gaps)`);
  const synth = await synthesise(row, allEvidence, allGaps, candidateReport);
  for (const t of synth.trace) { log(`[${t.agent}:${t.kind}] ${t.message}`); emit(t); }

  const fullTrace = [...refinementTrace, ...synth.trace];

  if (persist) {
    for (const e of mergedEvidence) store.saveEvidence(e);
    for (const t of fullTrace) store.saveTrace(t);
    store.saveBriefing(synth.briefing);
    store.saveCandidateReport(candidateReport);
  }

  return {
    case: row,
    evidence: allEvidence,
    trace: fullTrace,
    briefing: synth.briefing,
    candidateReport,
  };
}

/** Deduplicate evidence by URL, keeping the copy with the higher identity_match_score. */
function deduplicateEvidence(all: Evidence[]): Evidence[] {
  const seen = new Map<string, Evidence>();
  for (const e of all) {
    const existing = seen.get(e.url);
    if (!existing || e.identity_match_score > existing.identity_match_score) {
      seen.set(e.url, e);
    }
  }
  return [...seen.values()];
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
