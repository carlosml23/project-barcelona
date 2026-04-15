/**
 * Server-side tool helpers for Claude's built-in web_search and web_fetch.
 *
 * These tools run inside messages.create() — Anthropic executes them server-side.
 * No extra API keys needed (uses the same ANTHROPIC_API_KEY).
 *
 * This module provides:
 * - Tool definition builders (location-aware web_search + web_fetch)
 * - Response extractors (parse SearchHit[] from server-tool result blocks)
 * - Type guards for distinguishing server-tool blocks from client tool_use
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SearchHit } from "./exa.js";
import type { CaseRow } from "../state/types.js";

// ── Types ───────────────────────────────────────────────────────────────────

export type ServerToolDef =
  | Anthropic.WebSearchTool20250305
  | Anthropic.WebFetchTool20250910;

export interface ServerToolConfig {
  maxSearches?: number;
  maxFetches?: number;
}

// ── Country → Timezone Lookup ───────────────────────────────────────────────

const COUNTRY_TZ_MAP: Record<string, string> = {
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  IT: "Europe/Rome",
  PT: "Europe/Lisbon",
  GB: "Europe/London",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  AT: "Europe/Vienna",
  CH: "Europe/Zurich",
  PL: "Europe/Warsaw",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  IE: "Europe/Dublin",
  GR: "Europe/Athens",
  CZ: "Europe/Prague",
  RO: "Europe/Bucharest",
  HU: "Europe/Budapest",
  MX: "America/Mexico_City",
  AR: "America/Argentina/Buenos_Aires",
  CO: "America/Bogota",
  CL: "America/Santiago",
  PE: "America/Lima",
  EC: "America/Guayaquil",
  US: "America/New_York",
  BR: "America/Sao_Paulo",
};

// ── Tool Definition Builders ────────────────────────────────────────────────

/** Build user_location from debtor's CaseRow fields. */
export function buildUserLocation(row: CaseRow): Anthropic.UserLocation | undefined {
  if (!row.country) return undefined;

  return {
    type: "approximate" as const,
    ...(row.city ? { city: row.city } : {}),
    ...(row.provincia ? { region: row.provincia } : {}),
    country: row.country,
    ...(COUNTRY_TZ_MAP[row.country] ? { timezone: COUNTRY_TZ_MAP[row.country] } : {}),
  };
}

/** Build server-side tool definitions for web_search + web_fetch. */
export function buildServerToolDefs(
  row: CaseRow,
  config: ServerToolConfig = {},
): ServerToolDef[] {
  const userLocation = buildUserLocation(row);

  const webSearch: Anthropic.WebSearchTool20250305 = {
    type: "web_search_20250305",
    name: "web_search",
    ...(config.maxSearches ? { max_uses: config.maxSearches } : {}),
    ...(userLocation ? { user_location: userLocation } : {}),
  };

  const webFetch: Anthropic.WebFetchTool20250910 = {
    type: "web_fetch_20250910",
    name: "web_fetch",
    ...(config.maxFetches ? { max_uses: config.maxFetches } : {}),
  };

  return [webSearch, webFetch];
}

// ── Type Guards ─────────────────────────────────────────────────────────────

/** Check if a content block is a server-side tool result (web_search or web_fetch). */
export function isServerToolResultBlock(
  block: Anthropic.ContentBlock,
): block is Anthropic.WebSearchToolResultBlock | Anthropic.WebFetchToolResultBlock {
  return block.type === "web_search_tool_result" || block.type === "web_fetch_tool_result";
}

/** Check if a content block is a server_tool_use invocation. */
export function isServerToolUseBlock(
  block: Anthropic.ContentBlock,
): block is Anthropic.ServerToolUseBlock {
  return block.type === "server_tool_use";
}

// ── Response Extraction ─────────────────────────────────────────────────────

/**
 * Extract SearchHit[] from a Claude response that used server-side tools.
 *
 * Walks through response content blocks and extracts:
 * - web_search_tool_result → individual search result items (url, title, page_age)
 * - web_fetch_tool_result → fetched page content (url, title, plaintext snippet)
 * - text blocks with citations → cited_text mapped to originating URLs
 *
 * For web_search results, the encrypted_content is not readable. Snippets come
 * from citations in Claude's text output or from web_fetch content.
 */
export function extractSearchHitsFromResponse(
  response: Anthropic.Message,
): SearchHit[] {
  const hits: SearchHit[] = [];
  const now = new Date().toISOString();

  // Collect citation text indexed by URL for enriching search result snippets
  const citationsByUrl = extractCitationsByUrl(response);

  for (const block of response.content) {
    if (block.type === "web_search_tool_result") {
      hits.push(...extractFromWebSearch(block, citationsByUrl, now));
    } else if (block.type === "web_fetch_tool_result") {
      hits.push(...extractFromWebFetch(block, now));
    }
  }

  return hits;
}

/** Count how many server-side tool uses are in a response. */
export function countServerToolUses(response: Anthropic.Message): number {
  return response.content.filter((b) => b.type === "server_tool_use").length;
}

/** Extract Claude's text reasoning from the response (non-tool blocks). */
export function extractTextContent(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ── Internal Helpers ────────────────────────────────────────────────────────

function extractFromWebSearch(
  block: Anthropic.WebSearchToolResultBlock,
  citationsByUrl: Map<string, string>,
  retrievedAt: string,
): SearchHit[] {
  // content can be an error or an array of results
  if (!Array.isArray(block.content)) return [];

  return block.content
    .filter((item): item is Anthropic.WebSearchResultBlock => item.type === "web_search_result")
    .map((item) => ({
      url: item.url,
      title: item.title,
      snippet: citationsByUrl.get(item.url) ?? `[${item.title}] — ${item.page_age ?? "unknown date"}`,
      source: safeHost(item.url),
      retrieved_at: retrievedAt,
      raw: { page_age: item.page_age, encrypted: true },
    }));
}

function extractFromWebFetch(
  block: Anthropic.WebFetchToolResultBlock,
  retrievedAt: string,
): SearchHit[] {
  // content is either an error or a WebFetchBlock (web_fetch_result)
  if ("error_code" in block.content) return [];

  const fetchResult = block.content;
  const doc = fetchResult.content;
  const title = doc?.title ?? undefined;
  const snippet = extractPlainText(doc);

  return [
    {
      url: fetchResult.url,
      title,
      snippet: snippet.slice(0, 600),
      source: safeHost(fetchResult.url),
      retrieved_at: fetchResult.retrieved_at ?? retrievedAt,
      raw: { fetched: true },
    },
  ];
}

/** Extract plaintext from a DocumentBlock source. */
function extractPlainText(doc: Anthropic.DocumentBlock | undefined): string {
  if (!doc) return "";
  const source = doc.source;
  // PlainTextSource has type "text" + data string
  if (source.type === "text") {
    return source.data;
  }
  // Base64PDFSource — not directly extractable as text
  return "";
}

/**
 * Extract citations from Claude's text blocks, indexed by source URL.
 * Citations provide the readable text that corresponds to web_search results
 * (whose encrypted_content is not directly readable).
 */
function extractCitationsByUrl(response: Anthropic.Message): Map<string, string> {
  const map = new Map<string, string>();

  for (const block of response.content) {
    if (block.type !== "text") continue;
    // The SDK represents citations as an array on text blocks
    const citations = (block as unknown as Record<string, unknown>).citations;
    if (!Array.isArray(citations)) continue;

    for (const cite of citations) {
      if (
        cite &&
        typeof cite === "object" &&
        "url" in cite &&
        "cited_text" in cite &&
        typeof cite.url === "string" &&
        typeof cite.cited_text === "string"
      ) {
        // Accumulate cited text per URL (may have multiple citations)
        const existing = map.get(cite.url) ?? "";
        const combined = existing ? `${existing} … ${cite.cited_text}` : cite.cited_text;
        map.set(cite.url, combined.slice(0, 500));
      }
    }
  }

  return map;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
