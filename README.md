# Sherlock

> OSINT multi-agent system that transforms a debtor profile into an evidence-backed collector briefing in under 60 seconds.

Built for the **Vexor Hackathon** (24h build).

---

## What It Does

Given a debtor's name, country, and debt context, Sherlock fans out across country-specific public sources, gathers cited evidence, and synthesises a collector briefing with:

- **Findings** — employment, property, business roles, legal records (each citing real evidence)
- **Negotiation angles** — ready-to-use talking points tailored to the debtor's profile
- **Gaps** — an honest record of what was searched and came up empty
- **Confidence score** — overall assessment of evidence strength

Every claim in the output cites at least one real evidence ID. Claims without verifiable citations are automatically dropped — zero hallucinations by design.

---

## How It Works

Sherlock uses a **three-phase search architecture** that balances speed, coverage, and cost:

```
Phase 0: Agentic Discovery          Phase 1: Deterministic Fan-Out
Claude + web_search/web_fetch       Country playbook -> 20-40 queries
(location-aware, broad)             (Exa + Tavily, all parallel)
         |                                    |
         +-------- run in PARALLEL -----------+
                          |
                   Deduplicate + Merge
                          |
                       Verifier
                   (score, filter, gaps)
                          |
              Phase 2: Agentic Refinement
              Claude + 5 tools fills gaps
              (max 3 iterations, 6 tool calls)
                          |
                      Synthesiser
                 (cite-or-omit briefing)
                          |
                    Final Briefing
```

**Phase 0** — Claude discovers unexpected leads via broad web search (location-aware).
**Phase 1** — Deterministic, no LLM. Country playbook fires 20-40 queries in parallel via `Promise.all()`. Total time = slowest single query (~2s), not the sum.
**Phase 2** — Claude inspects gaps from Phases 0+1 and runs targeted follow-up searches.

Phases 0 and 1 run in parallel. The system works without Phases 0 and 2 if no Anthropic API key is provided (heuristic fallback).

---

## Anti-Hallucination: Three Layers

| Layer | What It Does |
|-------|-------------|
| **Identity Scoring** | Every search hit is scored against the debtor's known data (DNI, phone, employer, city). Field weights + authority bonuses for official sources. |
| **Verification Gate** | Hard filter: only evidence with `score >= 0.5` or `pairing_confidence in {high, very_high}` reaches the synthesiser. Everything else is dropped. |
| **Citation Enforcement** | After synthesis, `enforceCitations()` checks every `evidence_id` in every finding. If an ID doesn't resolve to real verified evidence, the entire finding is dropped. |

---

## Web UI

A real-time investigation dashboard with live streaming of agent activity.

```
npm run dev:all    # API server (:3001) + Next.js (:3000)
```

**Features:**
- Perplexity-style phased UX — immediate feedback, live source discovery, then clean final report
- Source pills appear in real-time as APIs respond
- Expandable sections for evidence, gaps, and full investigation trace
- Case history sidebar for reviewing past investigations
- CSV batch upload for multiple debtors

**Stack:** Next.js 15 (App Router), Tailwind CSS, shadcn/ui, Framer Motion, SSE streaming.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ESM, Node 20+) |
| LLM (synthesis) | Claude Sonnet 4.5 via Anthropic SDK |
| LLM (refinement + discovery) | Claude Haiku 4.5 |
| Neural search | Exa (semantic/LinkedIn/people) |
| Web search | Tavily (registries/news/exact match) |
| Agentic search | Claude web_search (location-aware) + web_fetch (free) |
| Scraping | Firecrawl (JS rendering) |
| API server | Hono |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Validation | Zod at every boundary |
| Frontend | Next.js 15, Tailwind CSS, shadcn/ui, Framer Motion |
| Package manager | npm |

---

## Quickstart

```bash
# Install dependencies
npm install
cd web && npm install && cd ..

# Configure environment
cp .env.example .env
# Fill in: EXA_API, TAVILY_API, FIRECRAWL, ANTHROPIC_API_KEY
```

### Run the Web UI

```bash
npm run dev:all
# Open http://localhost:3000
```

### Run from CLI

```bash
npm run run:one -- \
  --name "Carlos Sebastian Morales Lascano" \
  --country ES \
  --phone "+34654145000" \
  --employer "Telefonica" \
  --city "Madrid" \
  --debt 5000 --origin personal_loan --age 12 \
  --attempts 1 --outcome busy --legal no_assets_found
```

### Other Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:all` | Start API + Web UI together |
| `npm run server` | API server only (port 3001) |
| `npm run web` | Next.js dev server only (port 3000) |
| `npm run run:one` | Single debtor investigation (CLI) |
| `npm run run:case` | CSV batch investigation (CLI) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run tests (vitest) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXA_API` | Yes | Exa neural search API key |
| `TAVILY_API` | Yes | Tavily web search API key |
| `FIRECRAWL` | Yes | Firecrawl scraping API key |
| `ANTHROPIC_API_KEY` | Recommended | Enables synthesis, refinement, and discovery. Without it, Phases 0+2 are skipped and a heuristic fallback generates the briefing. |
| `SQLITE_PATH` | No | Database path (default: `./data/app.db`) |
| `DISCOVERY_ENABLED` | No | Set to `false` to disable agentic discovery (default: `true`) |
| `DISCOVERY_MAX_SEARCHES` | No | Max web_search calls per case (default: 5, cost: $0.01/search) |
| `REFINER_MAX_ITERATIONS` | No | Max refinement loop iterations (default: 3) |
| `REFINER_MAX_TOOL_CALLS` | No | Max tool calls in refinement (default: 6) |

---

## Country Playbooks

Playbooks are declarative search strategies — all country-specific intelligence lives in playbook files, not in the orchestrator.

### Spain (23 recipes)

Covers BOE, BORME, BDNS, Registro de la Propiedad, Catastro, Axesor, eInforma, Infocif, professional registries (medical, legal), LinkedIn, phone lookups, and more. Queries adapt to available data — if DNI is provided, high-priority DNI-based searches run alongside name-based ones. Without DNI, those recipes are skipped automatically.

### Default (4 recipes)

Generic fallback for countries without a dedicated playbook: LinkedIn, web search, news, and social media.

### Adding a New Country

1. Create `src/playbooks/XX.ts` with country-specific recipes
2. Add one line to `src/playbooks/index.ts`

No orchestrator, verifier, or synthesiser changes needed.

See [docs/playbooks.md](docs/playbooks.md) for every recipe, query patterns, and design principles.

---

## Architecture

```
src/
  agents/
    discovery.ts      # Phase 0: Claude + web_search/web_fetch
    search.ts         # Phase 1: parallel recipe fan-out
    verifier.ts       # Identity scoring, filtering, gap detection
    synthesiser.ts    # Claude synthesis + citation enforcement
    identity.ts       # Name normalisation + data point extraction
  orchestrator/
    graph.ts          # End-to-end pipeline (immutable state)
  playbooks/
    ES.ts             # Spain: 23 recipes
    default.ts        # Generic fallback: 4 recipes
    index.ts          # Country registry
  tools/
    exa.ts            # Exa neural search client
    tavily.ts         # Tavily web search client
    firecrawl.ts      # Firecrawl scraper client
    serverTools.ts    # Claude web_search/web_fetch helpers
    resilience.ts     # Retry, timeout, circuit breaker
    registry.ts       # Tool registry for refiner
  server/
    index.ts          # Hono API server (SSE streaming)
  state/
    types.ts          # Zod schemas (CaseRow, Evidence, Briefing, TraceEvent)
    store.ts          # SQLite persistence
  cli/
    runOne.ts         # Single-case CLI
    runCase.ts        # CSV batch CLI
  config/
    env.ts            # Zod-validated env loader
web/
  src/
    app/              # Next.js App Router
    components/       # Investigation UI components
    hooks/            # useInvestigation (SSE streaming + state)
    config/           # Agent metadata, labels
    lib/              # Types, utilities
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full deep-dive, including data flow diagrams, scoring mechanics, and the resilience layer.

---

## Deep-Dive Docs

| Document | What It Covers |
|----------|---------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, data flow, anti-hallucination layers, end-to-end example |
| [docs/tools.md](docs/tools.md) | Search tools (Exa, Tavily, Firecrawl, web_search, web_fetch), resilience layer |
| [docs/parallel-search.md](docs/parallel-search.md) | Concurrency model, scoring pipeline, full execution walkthrough |
| [docs/playbooks.md](docs/playbooks.md) | Country playbook system, all 23 Spain recipes, adding new countries |
| [docs/web-ui.md](docs/web-ui.md) | Web UI architecture, component breakdown, SSE streaming, API endpoints |

---

## Graceful Degradation

| Situation | What Happens |
|-----------|-------------|
| No Anthropic API key | Phases 0+2 skipped. Heuristic synthesiser builds briefing from Phase 1 evidence. |
| Exa API is down | Circuit breaker trips after 5 failures. LinkedIn recipes emit gaps. Tavily + web_search continue. |
| No DNI provided | DNI-based recipes skipped (~10 fewer queries). Name/phone/employer queries still run. |
| Phone is invalid | Phone field suppressed, phone recipes skipped. |
| Firecrawl times out | Refiner uses web_fetch (free) as fallback for static pages. |

---

## License

[MIT](./LICENSE)
