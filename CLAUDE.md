# Project Barcelona — Debtor Intelligence Agent

## Project Overview

OSINT multi-agent system built for the Vexor hackathon. Given a debtor (name, country, phone) plus debt context (amount, age, origin, prior call outcome, prior legal asset finding), the agent fans out across country-specific public sources, gathers cited evidence, and synthesises a collector briefing: findings, negotiation angles, and an honest record of gaps.

**Design principles (aligned to judging rubric):**
- **Source defensibility** — every claim in the briefing cites ≥1 `evidence_id`; a post-check drops any claim whose citation doesn't resolve to a captured evidence row. No hallucinations.
- **Reasoning transparency** — every tool call, tool result, and verifier decision is streamed to a trace and persisted to SQLite.
- **Honest gaps** — the verifier emits explicit "searched X, found nothing" records that the synthesiser must include.
- **Country-aware routing** — declarative `playbooks/{ES,default}.ts` map countries to ranked source recipes (BORME, Registro Mercantil, Infoempresa, Registro de la Propiedad for Spain; generic LinkedIn+news fallback otherwise).

## Tech Stack

- **Language:** TypeScript (ESM, Node ≥20)
- **Runtime:** tsx for dev, `tsc` for build
- **LLM:** Anthropic SDK — Claude Sonnet 4.5 as orchestrator/synthesiser (heuristic fallback if `ANTHROPIC_API_KEY` is absent)
- **Search/scraping:** Exa (neural search, LinkedIn), Tavily (web + news), Firecrawl (JS-heavy page extraction)
- **Database:** SQLite via `better-sqlite3` (cases, evidence, traces, briefings)
- **Validation:** Zod at every boundary
- **Package manager:** npm

## Architecture

```
CLI (runOne / runCase)
        │
        ▼
Orchestrator  ──► Search fan-out (parallel recipes: Exa | Tavily | Firecrawl)
                        │
                        ▼
                Evidence Store (SQLite)
                        │
                        ▼
                Verifier (identity-match score, gap detection)
                        │
                        ▼
                Synthesiser (Claude, cite-or-omit JSON)
                        │
                        ▼
                Briefing (findings • angles • gaps • confidence)
```

### Key directories

| Path | Purpose |
|---|---|
| `src/config/env.ts` | Zod-validated env loader (`.env`) |
| `src/state/types.ts` | Zod schemas: `CaseRow`, `Evidence`, `Briefing`, `TraceEvent`, `CaseState` |
| `src/state/store.ts` | SQLite persistence (cases, evidence, traces, briefings) |
| `src/tools/{exa,tavily,firecrawl}.ts` | Typed tool wrappers returning citation-ready `SearchHit` rows |
| `src/playbooks/{ES,default}.ts` | Country-aware source recipes |
| `src/agents/identity.ts` | Name normalisation + phone→country hinting |
| `src/agents/search.ts` | Parallel recipe fan-out with full trace |
| `src/agents/verifier.ts` | Identity-match scoring, evidence filtering, gap emission |
| `src/agents/synthesiser.ts` | Claude call with strict JSON schema + citation post-check |
| `src/orchestrator/graph.ts` | End-to-end pipeline (immutable state) |
| `src/cli/runOne.ts` | Single-name CLI entry point |
| `src/cli/runCase.ts` | CSV-batch CLI (stub — batch orchestrator coming) |
| `src/data/loadCases.ts` | CSV loader (reserved for batch mode) |

## Development Workflow

### Setup

```bash
npm install
cp .env.example .env   # then fill EXA_API, TAVILY_API, FIRECRAWL, and optionally ANTHROPIC_API_KEY
```

### Running the project

```bash
# Smoke test — list loaded playbooks
npm run dev

# Run a single live case (primary flow)
npm run run:one -- --name "Full Name" --country ES --phone +34600111222 \
  --debt 5000 --origin personal_loan --age 12 --attempts 1 \
  --outcome busy --legal no_assets_found

# Run tests
npm test

# Typecheck
npm run typecheck

# Build
npm run build
```

### Key commands (slash)

| Command | Purpose |
|---------|---------|
| `/plan` | Break down a feature before implementing |
| `/tdd` | Write tests first, then implementation |
| `/code-review` | Quality review before committing |
| `/build-fix` | Fix build or type errors |
| `/e2e` | Generate and run end-to-end tests |
| `/security-review` | Scan for vulnerabilities |

## Conventions

- **No mutation** — all state transitions return new objects (see `orchestrator/graph.ts`).
- **Validate at boundaries** — Zod parses every CSV row, env var, and model output.
- **Cite or omit** — the synthesiser MUST attach `evidence_ids` to every finding; the post-check in `agents/synthesiser.ts#enforceCitations` drops orphan claims.
- **Country playbooks are declarative** — add a country by dropping `src/playbooks/XX.ts` and registering it in `src/playbooks/index.ts`; no orchestrator changes.
- No `console.log` in library code — logging is routed through the `onTrace` callback passed to `runCase`.
- No `--no-verify` on git commands (enforced by PreToolUse hook).
- Commit message format: `type(scope): description`.

## Judging-rubric map

| Criterion | Where it's enforced |
|---|---|
| Relevance of findings | `playbooks/ES.ts` — ranked real-world source recipes; `verifier.ts` filters low-signal hits |
| Source defensibility | `synthesiser.ts#enforceCitations` — drops claims whose `evidence_ids` don't resolve |
| Reasoning transparency | `TraceEvent` stream in `orchestrator/graph.ts`, persisted in `traces` table |
| Honesty about gaps | `verifier.ts` emits `Gap[]` for every empty source bucket; synthesiser must include them |

## Context Window Management

- Run `/compact` manually when nearing limits, or let the suggest-compact hook guide you
- Disable unused MCPs per session via `/plugins`
- Keep active MCPs under 10, active tools under 80

ALWAYS use Specific for new projects and services, including frontend apps. Run `specific docs` to learn how to use Specific. ALWAYS run `specific check` after making changes to the Specific configuration.
