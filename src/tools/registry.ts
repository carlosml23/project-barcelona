import { z } from "zod";
import { exaSearch, type ExaSearchOptions, type SearchHit } from "./exa.js";
import { tavilySearch, type TavilySearchOptions } from "./tavily.js";
import { firecrawlScrape } from "./firecrawl.js";

// ── OsintTool Interface (inspired by Claude Code's buildTool pattern) ────────

export interface OsintTool<Input = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<Input>;
  readonly isConcurrencySafe: boolean;
  call(args: Input): Promise<SearchHit[]>;
}

// ── Input Schemas ────────────────────────────────────────────────────────────

const SearchWebInputSchema = z.object({
  query: z.string().min(1),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
  maxResults: z.number().int().min(1).max(20).optional(),
  searchDepth: z.enum(["basic", "advanced"]).optional(),
});
type SearchWebInput = z.infer<typeof SearchWebInputSchema>;

const SearchNeuralInputSchema = z.object({
  query: z.string().min(1),
  includeDomains: z.array(z.string()).optional(),
  numResults: z.number().int().min(1).max(20).optional(),
  category: z.enum(["company", "linkedin profile", "news", "personal site"]).optional(),
});
type SearchNeuralInput = z.infer<typeof SearchNeuralInputSchema>;

const ScrapePageInputSchema = z.object({
  url: z.string().url(),
});
type ScrapePageInput = z.infer<typeof ScrapePageInputSchema>;

// ── Tool Implementations ─────────────────────────────────────────────────────

const searchWebTool: OsintTool<SearchWebInput> = {
  name: "search_web",
  description:
    "Web search via Tavily. Best for government registries (BOE, BORME, registradores.org), " +
    "news articles, and official Spanish sources. Supports domain filtering to target specific registries.",
  inputSchema: SearchWebInputSchema,
  isConcurrencySafe: true,
  async call(args) {
    const opts: TavilySearchOptions = {
      maxResults: args.maxResults,
      searchDepth: args.searchDepth,
      includeDomains: args.includeDomains,
      excludeDomains: args.excludeDomains,
    };
    return tavilySearch(args.query, opts);
  },
};

const searchNeuralTool: OsintTool<SearchNeuralInput> = {
  name: "search_neural",
  description:
    "Neural search via Exa. Best for finding LinkedIn profiles, company websites, " +
    "and people search. Supports category filtering (linkedin profile, company, news).",
  inputSchema: SearchNeuralInputSchema,
  isConcurrencySafe: true,
  async call(args) {
    const opts: ExaSearchOptions = {
      numResults: args.numResults,
      includeDomains: args.includeDomains,
      category: args.category,
    };
    return exaSearch(args.query, opts);
  },
};

const scrapePageTool: OsintTool<ScrapePageInput> = {
  name: "scrape_page",
  description:
    "Extract full content from a specific URL via Firecrawl. Use when you know " +
    "the exact URL (e.g., a registry page, a LinkedIn profile, a company listing).",
  inputSchema: ScrapePageInputSchema,
  isConcurrencySafe: true,
  async call(args) {
    const result = await firecrawlScrape(args.url);
    // Normalize ScrapeResult → SearchHit for uniform output
    return [
      {
        url: result.url,
        title: result.title,
        snippet: result.markdown.slice(0, 600),
        source: safeHost(result.url),
        retrieved_at: result.retrieved_at,
        raw: result.raw,
      },
    ];
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: readonly OsintTool[] = [
  searchWebTool,
  searchNeuralTool,
  scrapePageTool,
] as const;

/** Claude Code pattern: lookup tool by name from the registry. */
export function findToolByName(name: string): OsintTool | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

// ── Anthropic SDK Conversion ─────────────────────────────────────────────────

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Convert our tool registry to Anthropic SDK Tool[] format.
 * Used by the refiner to expose tools to Claude in the tool-use loop.
 */
export function registryToAnthropicTools(): AnthropicToolDef[] {
  return TOOL_REGISTRY.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.inputSchema),
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Minimal Zod-to-JSON-Schema converter for our simple tool schemas.
 * Handles: z.object, z.string, z.number, z.enum, z.array, .optional()
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return zodTypeToJson(schema);
}

function zodTypeToJson(zType: z.ZodType): Record<string, unknown> {
  const def = (zType as z.ZodType & { _def: Record<string, unknown> })._def;
  const typeName = def.typeName as string;

  if (typeName === "ZodObject") {
    const shape = (zType as z.ZodObject<z.ZodRawShape>).shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldDef = (value as z.ZodType & { _def: Record<string, unknown> })._def;
      if (fieldDef.typeName === "ZodOptional") {
        properties[key] = zodTypeToJson(fieldDef.innerType as z.ZodType);
      } else {
        properties[key] = zodTypeToJson(value as z.ZodType);
        required.push(key);
      }
    }

    return { type: "object", properties, required };
  }

  if (typeName === "ZodString") return { type: "string" };
  if (typeName === "ZodNumber") return { type: "number" };

  if (typeName === "ZodEnum") {
    const values = (def as Record<string, unknown>).values as string[];
    return { type: "string", enum: values };
  }

  if (typeName === "ZodArray") {
    const inner = zodTypeToJson(def.type as z.ZodType);
    return { type: "array", items: inner };
  }

  if (typeName === "ZodOptional") {
    return zodTypeToJson(def.innerType as z.ZodType);
  }

  return { type: "string" }; // fallback
}
