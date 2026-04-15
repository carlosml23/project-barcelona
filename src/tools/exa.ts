import { env } from "../config/env.js";

export interface SearchHit {
  url: string;
  title?: string;
  snippet: string;
  source: string;
  retrieved_at: string;
  raw?: unknown;
}

interface ExaResult {
  id?: string;
  url: string;
  title?: string;
  text?: string;
  highlights?: string[];
  publishedDate?: string;
  author?: string;
}

interface ExaResponse {
  results: ExaResult[];
}

export interface ExaSearchOptions {
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  useAutoprompt?: boolean;
  category?: "company" | "linkedin profile" | "news" | "personal site" | "research paper";
}

export async function exaSearch(
  query: string,
  opts: ExaSearchOptions = {},
): Promise<SearchHit[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.EXA_API,
    },
    body: JSON.stringify({
      query,
      numResults: opts.numResults ?? 8,
      useAutoprompt: opts.useAutoprompt ?? true,
      type: "neural",
      contents: { text: { maxCharacters: 1200 }, highlights: { numSentences: 2 } },
      includeDomains: opts.includeDomains,
      excludeDomains: opts.excludeDomains,
      category: opts.category,
    }),
  });
  if (!res.ok) throw new Error(`Exa search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as ExaResponse;
  const ts = new Date().toISOString();
  return data.results.map((r) => ({
    url: r.url,
    title: r.title,
    snippet: (r.highlights?.join(" ") ?? r.text ?? "").slice(0, 600),
    source: new URL(r.url).hostname,
    retrieved_at: ts,
    raw: r,
  }));
}
