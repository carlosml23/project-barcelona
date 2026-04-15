import { exaSearch } from "../tools/exa.js";
import { tavilySearch } from "../tools/tavily.js";
import { firecrawlScrape } from "../tools/firecrawl.js";
import { getPlaybook } from "../playbooks/index.js";
import { buildPlaybookCtx, nameTokens } from "./identity.js";
import type { CaseRow, Evidence, TraceEvent } from "../state/types.js";
import { newId } from "../util/id.js";
import type { SourceRecipe } from "../playbooks/types.js";

export interface SearchRunResult {
  evidence: Evidence[];
  trace: TraceEvent[];
}

export async function runSearchFanOut(row: CaseRow): Promise<SearchRunResult> {
  const playbook = getPlaybook(row.country);
  const ctx = buildPlaybookCtx(row);
  const trace: TraceEvent[] = [];
  const ts = () => new Date().toISOString();

  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: "orchestrator",
    kind: "plan",
    message: `playbook=${playbook.label} recipes=${playbook.recipes.length}`,
    data: { recipes: playbook.recipes.map((r) => r.id) },
  });

  const results = await Promise.all(
    playbook.recipes.map((r) => runRecipe(row, r, ctx, trace)),
  );

  return { evidence: results.flat(), trace };
}

async function runRecipe(
  row: CaseRow,
  recipe: SourceRecipe,
  ctx: ReturnType<typeof buildPlaybookCtx>,
  trace: TraceEvent[],
): Promise<Evidence[]> {
  const ts = () => new Date().toISOString();
  const q = recipe.buildQuery(ctx);
  trace.push({
    ts: ts(),
    case_id: row.case_id,
    agent: recipe.id,
    kind: "tool_call",
    message: `${recipe.tool} "${q.query}"`,
  });

  try {
    const hits =
      recipe.tool === "exa"
        ? await exaSearch(q.query, { includeDomains: q.includeDomains, numResults: 6 })
        : recipe.tool === "tavily"
          ? await tavilySearch(q.query, { includeDomains: q.includeDomains, maxResults: 6 })
          : [
              {
                ...(await firecrawlScrape(q.query)),
                snippet: "",
                source: safeHost(q.query),
              },
            ];

    const tokens = nameTokens(row.full_name);
    const evidence: Evidence[] = hits.map((h) => ({
      id: newId("ev_"),
      case_id: row.case_id,
      agent: recipe.id,
      source: h.source,
      url: h.url,
      title: h.title,
      snippet: "snippet" in h && h.snippet ? h.snippet : "",
      retrieved_at: h.retrieved_at,
      identity_match_score: scoreMatch(tokens, `${h.title ?? ""} ${"snippet" in h ? h.snippet : ""}`),
      signal_type: recipe.signal_type,
      raw: h.raw,
    }));

    trace.push({
      ts: ts(),
      case_id: row.case_id,
      agent: recipe.id,
      kind: "tool_result",
      message: `${evidence.length} hits`,
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

function scoreMatch(tokens: string[], text: string): number {
  if (tokens.length === 0) return 0;
  const lower = text.toLowerCase();
  const hits = tokens.filter((t) => lower.includes(t)).length;
  return Math.min(1, hits / tokens.length);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
