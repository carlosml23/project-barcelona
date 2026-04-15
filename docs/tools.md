# Search Tools — Deep Dive

The system uses three external search APIs, each wrapped in a typed client with a shared resilience layer. Every tool returns the same `SearchHit` interface so the rest of the pipeline doesn't care which API produced the result.

---

## Uniform Output: SearchHit

Every tool — regardless of API — returns this shape:

```typescript
interface SearchHit {
  url: string;          // Canonical URL of the result
  title?: string;       // Page title (if available)
  snippet: string;      // Text extract (max 600 chars)
  source: string;       // Hostname (e.g., "linkedin.com", "boe.es")
  retrieved_at: string; // ISO timestamp of when we fetched it
  raw?: unknown;        // Full API response (preserved for debugging)
}
```

This uniformity means the scorer, verifier, and synthesiser never need to know which tool produced a given piece of evidence.

**File:** `src/tools/exa.ts:4-11`

---

## Tool 1: Exa (Neural Search)

**Best for:** LinkedIn profiles, company pages, people search, semantic matching.

**File:** `src/tools/exa.ts`

### How It Works

Exa uses **neural/semantic search** — it understands the *meaning* of a query, not just keywords. When you search `"Carlos Morales engineer Telefonica Madrid"`, Exa finds LinkedIn profiles even if the exact phrase doesn't appear on the page.

### API Call

```
POST https://api.exa.ai/search
Headers: x-api-key: <EXA_API>

{
  "query": "carlos morales lascano Telefonica Madrid site:linkedin.com/in",
  "numResults": 8,
  "useAutoprompt": true,       // Exa rewrites query for better recall
  "type": "neural",            // Semantic search (not keyword)
  "contents": {
    "text": { "maxCharacters": 1200 },
    "highlights": { "numSentences": 2 }
  },
  "includeDomains": ["linkedin.com"],
  "category": "linkedin profile"
}
```

### Options

```typescript
interface ExaSearchOptions {
  numResults?: number;         // Default: 8
  includeDomains?: string[];   // Restrict to specific sites
  excludeDomains?: string[];   // Exclude specific sites
  useAutoprompt?: boolean;     // Let Exa enhance the query (default: true)
  category?: "company" | "linkedin profile" | "news" | "personal site" | "research paper";
}
```

The `category` parameter is powerful — setting it to `"linkedin profile"` tells Exa's neural model to weight LinkedIn-style content higher, improving precision.

### Response Mapping

```
Exa Result                          SearchHit
┌────────────────────┐              ┌──────────────────┐
│ url ───────────────│─────────────►│ url              │
│ title ─────────────│─────────────►│ title            │
│ highlights[] ──────│──► join ────►│ snippet (600ch)  │
│ text ──────────────│──► fallback  │                  │
│ (full response) ───│─────────────►│ raw              │
└────────────────────┘              │ source = hostname│
                                    │ retrieved_at=now │
                                    └──────────────────┘
```

Snippet preference: `highlights` (2 sentences) first, then `text` (1200 chars), capped at 600 chars.

### When the Spain Playbook Uses Exa

| Recipe | Query Pattern | Why Exa |
|--------|--------------|---------|
| `linkedin_es` | `"{name_variant} {employer} {city} site:linkedin.com/in"` | Neural search finds profiles even with name variations |
| `linkedin_es` (variants) | One query per name variant | Catches shortened names (e.g., "Carlos Morales" vs "Carlos Sebastian Morales Lascano") |

---

## Tool 2: Tavily (Web Search)

**Best for:** Government registries, official bulletins, news articles, keyword-exact searches.

**File:** `src/tools/tavily.ts`

### How It Works

Tavily is a **traditional web search API** optimised for structured results. It's the right tool when you need exact keyword matches — like searching a DNI number in the BOE (Boletin Oficial del Estado) or finding a name in a mercantile registry.

### API Call

```
POST https://api.tavily.com/search

{
  "api_key": "<TAVILY_API>",
  "query": "\"12345678Z\" site:boe.es",
  "search_depth": "basic",        // "basic" or "advanced" (deeper crawl)
  "max_results": 8,
  "include_domains": ["boe.es"],
  "topic": "general"              // "general" or "news"
}
```

### Options

```typescript
interface TavilySearchOptions {
  maxResults?: number;             // Default: 8
  searchDepth?: "basic" | "advanced";  // "advanced" = deeper crawl, slower
  includeDomains?: string[];
  excludeDomains?: string[];
  topic?: "general" | "news";      // "news" limits to news sources
}
```

### Response Mapping

```
Tavily Result                       SearchHit
┌────────────────────┐              ┌──────────────────┐
│ url ───────────────│─────────────►│ url              │
│ title ─────────────│─────────────►│ title            │
│ content ───────────│──► slice ───►│ snippet (600ch)  │
│ score ─────────────│              │                  │
│ (full response) ───│─────────────►│ raw              │
└────────────────────┘              │ source = hostname│
                                    │ retrieved_at=now │
                                    └──────────────────┘
```

### When the Spain Playbook Uses Tavily

Tavily handles **18 of 23 recipes** — it's the workhorse for registry lookups:

| Recipe | Query Pattern | Why Tavily |
|--------|--------------|-----------|
| `boe_buscon_dni` | `"12345678Z" site:boe.es` | Exact DNI match in official gazette |
| `boe_buscon_name` | `"Full Name" embargo multa herencia site:boe.es` | Keyword search for legal events |
| `bdns_subvenciones` | `"12345678Z" site:pap.hacienda.gob.es` | Grant database lookup |
| `telemaco_bop` | `"Full Name" boletín oficial provincial` | Provincial bulletin search |
| `registradores_propiedad` | `"12345678Z" titular propiedad registradores` | Property registry |
| `axesor_dni` | `"12345678Z" administrador site:axesor.es` | Business intelligence |
| `borme` | `"12345678Z" BORME registro mercantil` | Commerce registry |
| `einforma` | `"Full Name" administrador cargo site:einforma.com` | Company officer search |
| `infocif` | `"Full Name" {employer} site:infocif.es` | Company networks |
| `linkedin_es_web` | `"name variant" site:linkedin.com/in` | Fallback for profiles Exa misses |
| `tellows_phone` | `"600111222" site:tellows.es` | Reverse phone lookup |
| ... | ... | ... |

---

## Tool 3: Firecrawl (Page Scraper)

**Best for:** Extracting full content from JS-heavy pages, specific URLs, deep page content.

**File:** `src/tools/firecrawl.ts`

### How It Works

Firecrawl **renders JavaScript** and extracts the main content as clean markdown. It's used when you have an exact URL (e.g., from a search result) and need the full page content, not just a snippet.

### API Call

```
POST https://api.firecrawl.dev/v1/scrape
Headers: Authorization: Bearer <FIRECRAWL>

{
  "url": "https://sede.registradores.org/propiedad/titulares/...",
  "formats": ["markdown"],
  "onlyMainContent": true
}
```

### Response

```typescript
interface ScrapeResult {
  url: string;          // Resolved URL (may differ from input after redirects)
  title?: string;       // Page title from metadata
  markdown: string;     // Full page content as markdown (max 8000 chars)
  retrieved_at: string; // ISO timestamp
  raw?: unknown;        // Full API response
}
```

Note: Firecrawl returns up to **8000 characters** of markdown (vs 600 for search snippets), giving the scorer and synthesiser much richer text to work with.

### Timeout

Firecrawl uses a **30-second timeout** (vs 15s default for Exa/Tavily) because JavaScript rendering takes time:

```typescript
const FIRECRAWL_TIMEOUT_MS = 30_000;

export async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  return withResilience(
    "firecrawl",
    (signal) => firecrawlScrapeInternal(url, signal),
    { timeoutMs: FIRECRAWL_TIMEOUT_MS },  // Override default 15s
  );
}
```

### When the Playbooks Use Firecrawl

Firecrawl is not used in the deterministic playbook fan-out (recipes use `exa` or `tavily`). It's primarily used by the **refiner agent** when Claude identifies a specific URL to scrape — for example, a registry page referenced in a search snippet.

---

## Resilience Layer

**File:** `src/tools/resilience.ts`

Every tool call passes through `withResilience()` — a wrapper that provides retry logic, timeouts, and circuit breaking. No tool makes a raw HTTP call without this protection.

### Architecture

```
  Your code calls:    exaSearch("query")
                          │
                          ▼
                   withResilience("exa", fn)
                          │
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Circuit  │ │ Timeout  │ │  Retry   │
        │ Breaker  │ │  Guard   │ │  Logic   │
        └──────────┘ └──────────┘ └──────────┘
              │           │           │
              └───────────┼───────────┘
                          │
                          ▼
                   Actual HTTP call
```

### Configuration

```typescript
interface ResilienceConfig {
  maxRetries: number;         // Default: 3 — how many times to retry on transient errors
  baseDelayMs: number;        // Default: 1000ms — base for exponential backoff
  timeoutMs: number;          // Default: 15000ms — per-attempt timeout (30s for Firecrawl)
  circuitThreshold: number;   // Default: 5 — consecutive failures before circuit opens
  circuitCooldownMs: number;  // Default: 60000ms — how long circuit stays open
}
```

### 1. Timeout Guard

Each attempt gets its own `AbortController`. If the API doesn't respond within the timeout, the request is aborted:

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

const result = await fn(controller.signal);  // Signal passed to fetch()
clearTimeout(timer);
```

The tool's internal `fetch()` receives this `AbortSignal`, so the HTTP connection is truly cancelled — not just ignored.

### 2. Transient Error Detection

Not all errors should be retried. The resilience layer classifies errors:

```
TRANSIENT (retry)                       PERMANENT (fail immediately)
├── HTTP 429 (rate limited)             ├── HTTP 401 (invalid API key)
├── HTTP 500 (server error)             ├── HTTP 400 (malformed query)
├── HTTP 502 (bad gateway)              ├── HTTP 403 (forbidden)
├── HTTP 503 (service unavailable)      └── Any non-transient error
├── HTTP 504 (gateway timeout)
├── ECONNRESET (connection reset)
├── ETIMEDOUT (connection timeout)
├── ENOTFOUND (DNS failure)
└── AbortError (our timeout fired)
```

If an error is permanent, the function throws immediately — no wasted retries.

### 3. Exponential Backoff

When a transient error occurs, the retry waits progressively longer:

```
Attempt 0: immediate
Attempt 1: 1000ms  (baseDelay × 2⁰)
Attempt 2: 2000ms  (baseDelay × 2¹)
Attempt 3: 4000ms  (baseDelay × 2²)
── fail ──
```

This prevents hammering a struggling API with rapid retries.

### 4. Circuit Breaker

The circuit breaker tracks consecutive failures **per tool**. If a tool keeps failing, we stop trying:

```
State Machine:

  CLOSED (normal)
      │
      │  5 consecutive failures
      ▼
  OPEN (reject all calls immediately)
      │
      │  60 seconds cooldown
      ▼
  HALF-OPEN (allow 1 test call)
      │
      ├── success → CLOSED (reset counter)
      └── failure → OPEN (restart cooldown)
```

**Why this matters for parallel fan-out:** If Exa's API goes down mid-run, the circuit breaker prevents the remaining 10+ Exa queries from each waiting 15s to timeout. Instead, they fail instantly with `CircuitOpenError`, and the pipeline continues with Tavily and Firecrawl results.

```typescript
// Circuit state is tracked per tool name
const circuits = new Map<string, CircuitState>();

interface CircuitState {
  consecutiveFailures: number;
  openedAt: number | null;  // timestamp when circuit opened
}
```

### Full Lifecycle Example

```
exaSearch("carlos morales linkedin")
    │
    ├── withResilience("exa", fn)
    │       │
    │       ├── Check circuit: CLOSED ✓
    │       ├── Attempt 0: timeout 15s → HTTP 503
    │       │     └── Transient? Yes → backoff 1000ms
    │       ├── Attempt 1: timeout 15s → HTTP 503
    │       │     └── Transient? Yes → backoff 2000ms
    │       ├── Attempt 2: timeout 15s → HTTP 200 ✓
    │       │     └── Reset circuit counter → 0
    │       └── Return SearchHit[]
    │
    └── Evidence scored and added to results
```

---

## Tool Registry (for the Refiner)

**File:** `src/tools/registry.ts`

During the deterministic fan-out, the search agent calls tools directly. But the **refiner** needs to expose tools to Claude as callable functions. The registry bridges this gap.

### OsintTool Interface

```typescript
interface OsintTool<Input = unknown> {
  readonly name: string;              // Tool name exposed to Claude
  readonly description: string;       // What Claude sees
  readonly inputSchema: z.ZodType;    // Zod schema for input validation
  readonly isConcurrencySafe: boolean; // Can be called in parallel
  call(args: Input): Promise<SearchHit[]>;
}
```

### Registered Tools

| Name | Wraps | Input | Description (what Claude sees) |
|------|-------|-------|-------------------------------|
| `search_web` | Tavily | `{ query, includeDomains?, maxResults?, searchDepth? }` | "Web search via Tavily. Best for government registries (BOE, BORME), news, official Spanish sources." |
| `search_neural` | Exa | `{ query, includeDomains?, numResults?, category? }` | "Neural search via Exa. Best for LinkedIn profiles, company websites, people search." |
| `scrape_page` | Firecrawl | `{ url }` | "Extract full content from a specific URL via Firecrawl." |

### How the Refiner Uses It

1. `registryToAnthropicTools()` converts the registry to Anthropic SDK tool format (JSON Schema)
2. Tools are passed to Claude in the `tools` parameter of `messages.create()`
3. When Claude returns `tool_use` blocks, `findToolByName()` looks up the handler
4. The handler calls the underlying tool (which goes through `withResilience()`)
5. Results are scored and returned to Claude as `tool_result`

```
Claude (Haiku 4.5)
    │
    │ tool_use: { name: "search_neural", input: { query: "...", category: "linkedin profile" } }
    │
    ▼
findToolByName("search_neural")
    │
    ▼
searchNeuralTool.call(args)
    │
    ▼
exaSearch(args.query, opts)     ← goes through withResilience("exa", ...)
    │
    ▼
SearchHit[] → scored → Evidence[] → returned to Claude as tool_result
```

### Zod-to-JSON-Schema Converter

The registry includes a minimal `zodToJsonSchema()` converter that transforms Zod schemas into the JSON Schema format that Claude's API expects. It handles: `z.object`, `z.string`, `z.number`, `z.enum`, `z.array`, and `.optional()`.

---

## Summary: Which Tool for What

```
                        ┌─────────────────────────────────────────┐
                        │           SEARCH TASK                   │
                        └───────────┬─────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
            ┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
            │  Need exact  │ │ Need to    │ │ Need full   │
            │  keyword     │ │ find a     │ │ content of  │
            │  match?      │ │ person or  │ │ a known     │
            │              │ │ company?   │ │ URL?        │
            └───────┬──────┘ └─────┬──────┘ └──────┬──────┘
                    │              │               │
            ┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
            │   TAVILY     │ │    EXA     │ │  FIRECRAWL  │
            │  (web search)│ │  (neural)  │ │  (scraper)  │
            │              │ │            │ │             │
            │ BOE, BORME,  │ │ LinkedIn,  │ │ Registry    │
            │ registries,  │ │ company    │ │ pages, JS   │
            │ news, phone  │ │ sites,     │ │ apps, full  │
            │ lookups      │ │ people     │ │ content     │
            │              │ │ search     │ │ extraction  │
            │ 15s timeout  │ │ 15s timeout│ │ 30s timeout │
            └──────────────┘ └────────────┘ └─────────────┘
                    │              │               │
                    └──────────────┼───────────────┘
                                   │
                            ┌──────▼──────┐
                            │  SearchHit  │
                            │  (uniform)  │
                            └─────────────┘
```
