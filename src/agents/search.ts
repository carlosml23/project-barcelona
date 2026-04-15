import { exaSearch } from "../tools/exa.js";
import { tavilySearch } from "../tools/tavily.js";
import { firecrawlScrape } from "../tools/firecrawl.js";
import { getPlaybook } from "../playbooks/index.js";
import { buildPlaybookCtx, extractDataPoints, type DataPoint } from "./identity.js";
import type { CaseRow, Evidence, TraceEvent, PairingConfidence } from "../state/types.js";
import { newId } from "../util/id.js";
import type { QueryVariant, SourceRecipe, PlaybookCtx } from "../playbooks/types.js";

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
  const ctx = buildPlaybookCtx(row);
  const dataPoints = extractDataPoints(row);
  const trace: TraceEvent[] = [];
  const ts = () => new Date().toISOString();

  // Flatten all queries from all recipes, filtering by requires_fields
  const flatQueries: FlatQuery[] = [];
  for (const recipe of playbook.recipes) {
    const variants = recipe.buildQueries(ctx);
    for (const variant of variants) {
      const missing = variant.requires_fields.filter((f) => !hasField(ctx, f));
      if (missing.length > 0) continue;
      flatQueries.push({ recipe, variant });
    }
  }

  // Sort by priority (lower = higher priority)
  flatQueries.sort((a, b) => a.variant.priority - b.variant.priority);

  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: "orchestrator",
    kind: "plan",
    message: `playbook=${playbook.label} goal=${ctx.search_goal} recipes=${playbook.recipes.length} queries=${flatQueries.length} dataPoints=${dataPoints.length}`,
    data: {
      recipes: playbook.recipes.map((r) => r.id),
      queries: flatQueries.map((fq) => ({ recipe: fq.recipe.id, priority: fq.variant.priority })),
      available_fields: dataPoints.map((dp) => dp.field),
    },
  });

  const results = await Promise.all(
    flatQueries.map((fq) => runQuery(row, fq, dataPoints, trace)),
  );

  return { evidence: results.flat(), trace };
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
      const scoring = scoreDataPointPairing(dataPoints, text);
      return {
        id: newId("ev_"),
        case_id: row.case_id,
        agent: recipe.id,
        source: h.source,
        url: h.url,
        title: h.title,
        snippet: "snippet" in h && h.snippet ? h.snippet : "",
        retrieved_at: h.retrieved_at,
        identity_match_score: scoring.score,
        signal_type: recipe.signal_type,
        matched_data_points: scoring.matched_fields,
        pairing_confidence: scoring.confidence,
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

export interface PairingScore {
  score: number;
  confidence: PairingConfidence;
  matched_fields: string[];
}

export function scoreDataPointPairing(dataPoints: DataPoint[], text: string): PairingScore {
  const lower = text.toLowerCase();
  const matched_fields: string[] = [];

  for (const dp of dataPoints) {
    const found = dp.search_variants.some((v) => lower.includes(v.toLowerCase()));
    if (found) matched_fields.push(dp.field);
  }

  const count = matched_fields.length;
  const hasDni = matched_fields.includes("dni_nie");
  const hasPhone = matched_fields.includes("phone");
  const hasEmail = matched_fields.includes("email");
  const hasEmployer = matched_fields.includes("employer");

  if (count === 0) return { score: 0.0, confidence: "low", matched_fields };
  if (count === 1 && matched_fields[0] === "full_name") return { score: 0.3, confidence: "low", matched_fields };
  if (count === 1) return { score: 0.3, confidence: "low", matched_fields };

  // 2+ data points found
  if (hasDni) return { score: 0.95, confidence: "very_high", matched_fields };
  if (hasPhone) return { score: 0.85, confidence: "high", matched_fields };
  if (hasEmail) return { score: 0.80, confidence: "high", matched_fields };
  if (hasEmployer) return { score: 0.75, confidence: "high", matched_fields };

  // 3+ weaker fields
  if (count >= 3) return { score: 0.70, confidence: "medium", matched_fields };
  // 2 weaker fields
  return { score: 0.55, confidence: "medium", matched_fields };
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
