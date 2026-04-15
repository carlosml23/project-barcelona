import { env } from "../config/env.js";
import type { SearchHit } from "./exa.js";

interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

export interface TavilySearchOptions {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeDomains?: string[];
  excludeDomains?: string[];
  topic?: "general" | "news";
}

export async function tavilySearch(
  query: string,
  opts: TavilySearchOptions = {},
): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.TAVILY_API,
      query,
      search_depth: opts.searchDepth ?? "basic",
      max_results: opts.maxResults ?? 8,
      include_domains: opts.includeDomains,
      exclude_domains: opts.excludeDomains,
      topic: opts.topic ?? "general",
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as TavilyResponse;
  const ts = new Date().toISOString();
  return data.results.map((r) => ({
    url: r.url,
    title: r.title,
    snippet: r.content.slice(0, 600),
    source: new URL(r.url).hostname,
    retrieved_at: ts,
    raw: r,
  }));
}
