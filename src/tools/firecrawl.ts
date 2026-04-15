import { env } from "../config/env.js";
import { withResilience } from "./resilience.js";

export interface ScrapeResult {
  url: string;
  title?: string;
  markdown: string;
  retrieved_at: string;
  raw?: unknown;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: { title?: string; sourceURL?: string };
  };
  error?: string;
}

const FIRECRAWL_TIMEOUT_MS = 30_000; // Longer timeout for JS-rendered pages

async function firecrawlScrapeInternal(url: string, signal: AbortSignal): Promise<ScrapeResult> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.FIRECRAWL}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as FirecrawlScrapeResponse;
  if (!data.success || !data.data) throw new Error(`Firecrawl error: ${data.error ?? "unknown"}`);
  return {
    url: data.data.metadata?.sourceURL ?? url,
    title: data.data.metadata?.title,
    markdown: (data.data.markdown ?? "").slice(0, 8000),
    retrieved_at: new Date().toISOString(),
    raw: data,
  };
}

export async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  return withResilience(
    "firecrawl",
    (signal) => firecrawlScrapeInternal(url, signal),
    { timeoutMs: FIRECRAWL_TIMEOUT_MS },
  );
}
