import { exaSearch } from "../tools/exa.js";
import { tavilySearch } from "../tools/tavily.js";
import { firecrawlScrape } from "../tools/firecrawl.js";
import { getPlaybook } from "../playbooks/index.js";
import { buildPlaybookCtx, extractDataPoints, type DataPoint } from "./identity.js";
import { scoreEvidence } from "../identity/scorer.js";
import type { CaseRow, Evidence, TraceEvent } from "../state/types.js";
import { newId } from "../util/id.js";
import type { QueryVariant, SourceRecipe, PlaybookCtx } from "../playbooks/types.js";

// ── Call-outcome-aware context adjustment ────────────────────────────────────

/** Outcomes where the phone number is unreliable or belongs to someone else. */
const PHONE_UNRELIABLE_OUTCOMES = new Set(["invalid_number", "wrong_number", "not_debtor"]);


export interface SearchRunResult {
  evidence: Evidence[];
  trace: TraceEvent[];
}

interface FlatQuery {
  recipe: SourceRecipe;
  variant: QueryVariant;
}

export async function runSearchFanOut(row: CaseRow): Promise<SearchRunResult> {
  const playbook = getPlaybook(row.country);
  const ctx = adjustCtxForCallOutcome(buildPlaybookCtx(row), row.call_outcome);
  const dataPoints = extractDataPoints(row);
  const trace: TraceEvent[] = [];
  const ts = () => new Date().toISOString();

  // Flatten all queries from all recipes, filtering by requires_fields
  const flatQueries: FlatQuery[] = [];
  let skippedCount = 0;
  for (const recipe of playbook.recipes) {
    const variants = recipe.buildQueries(ctx);
    if (variants.length === 0) {
      skippedCount++;
      continue;
    }
    for (const variant of variants) {
      const missing = variant.requires_fields.filter((f) => !hasField(ctx, f));
      if (missing.length > 0) {
        skippedCount++;
        continue;
      }
      flatQueries.push({ recipe, variant });
    }
  }

  // Sort by priority (lower = higher priority)
  flatQueries.sort((a, b) => a.variant.priority - b.variant.priority);

  const phoneNote = PHONE_UNRELIABLE_OUTCOMES.has(row.call_outcome)
    ? ` phone_unreliable(${row.call_outcome})`
    : "";

  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: "orchestrator",
    kind: "plan",
    message: `playbook=${playbook.label} recipes=${playbook.recipes.length} queries=${flatQueries.length} skipped=${skippedCount} dataPoints=${dataPoints.length}${phoneNote}`,
    data: {
      recipes: playbook.recipes.map((r) => r.id),
      queries: flatQueries.map((fq) => ({ recipe: fq.recipe.id, priority: fq.variant.priority })),
      available_fields: dataPoints.map((dp) => dp.field),
      call_outcome: row.call_outcome,
    },
  });

  const results = await Promise.all(
    flatQueries.map((fq) => runQuery(row, fq, dataPoints, trace)),
  );

  return { evidence: results.flat(), trace };
}

/**
 * Adjust PlaybookCtx based on call outcome.
 * If phone is unreliable, suppress phone-dependent recipes.
 */
function adjustCtxForCallOutcome(ctx: PlaybookCtx, outcome: string): PlaybookCtx {
  if (!PHONE_UNRELIABLE_OUTCOMES.has(outcome)) return ctx;
  return { ...ctx, has_phone: false, phone: undefined };
}

async function runQuery(
  row: CaseRow,
  fq: FlatQuery,
  dataPoints: DataPoint[],
  trace: TraceEvent[],
): Promise<Evidence[]> {
  const { recipe, variant } = fq;
  const ts = () => new Date().toISOString();

  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: recipe.id,
    kind: "tool_call",
    message: `${recipe.tool} p${variant.priority} "${variant.query}"`,
  });

  try {
    const hits =
      recipe.tool === "exa"
        ? await exaSearch(variant.query, { includeDomains: variant.includeDomains, numResults: 6 })
        : recipe.tool === "tavily"
          ? await tavilySearch(variant.query, { includeDomains: variant.includeDomains, maxResults: 6 })
          : [
              {
                ...(await firecrawlScrape(variant.query)),
                snippet: "",
                source: safeHost(variant.query),
              },
            ];

    const evidence: Evidence[] = hits.map((h) => {
      const text = `${h.title ?? ""} ${"snippet" in h ? h.snippet : ""}`;
      const scoring = scoreEvidence(dataPoints, text, variant.target_pairs, h.source);
      return {
        id: newId("ev_"),
        case_id: row.case_id,
        agent: recipe.id,
        source: h.source,
        url: h.url,
        title: h.title,
        snippet: "snippet" in h && h.snippet ? h.snippet : "",
        retrieved_at: h.retrieved_at,
        identity_match_score: scoring.total,
        signal_type: recipe.signal_type,
        matched_data_points: scoring.matchedFields,
        pairing_confidence: scoring.pairingConfidence,
        raw: h.raw,
      };
    });

    trace.push({
      ts: ts(),
      case_id: row.case_id,
      agent: recipe.id,
      kind: "tool_result",
      message: `${evidence.length} hits (high_conf=${evidence.filter((e) => e.pairing_confidence === "high" || e.pairing_confidence === "very_high").length})`,
      data: { urls: evidence.map((e) => e.url) },
    });
    return evidence;
  } catch (err) {
    trace.push({
      ts: ts(),
      case_id: row.case_id,
      agent: recipe.id,
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function hasField(ctx: PlaybookCtx, field: string): boolean {
  switch (field) {
    case "dni_nie": return ctx.has_dni;
    case "email": return ctx.has_email;
    case "phone": return ctx.has_phone;
    case "employer": return ctx.has_employer;
    case "provincia": return !!ctx.provincia;
    case "city": return !!ctx.city;
    case "postal_code": return !!ctx.postal_code;
    default: return true;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
