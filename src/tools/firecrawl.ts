import { env } from "../config/env.js";

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

export async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
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
