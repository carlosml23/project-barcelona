# Debtor Intelligence Agent — Architecture

> OSINT multi-agent system that transforms a debtor profile into an evidence-backed collector briefing in under 60 seconds.

**Deep-dive docs:**

| Document | What it covers |
|----------|---------------|
| [docs/tools.md](docs/tools.md) | Search tools (Exa, Tavily, Firecrawl), resilience layer, tool registry |
| [docs/parallel-search.md](docs/parallel-search.md) | How 40+ queries fan out in parallel, scoring, and the full data flow |
| [docs/playbooks.md](docs/playbooks.md) | Country playbook system, all 23 Spain recipes, how to add a new country |

---

## End-to-End Example (Real Execution)

> Captured from an actual run — not fabricated. No DNI was provided in this case, so all DNI-based recipes were skipped, showing how the system adapts to available data.

**Input:**

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

**Data points available:** phone, employer, city (no DNI, no email).

---

### Step 1 — Identity + Search Fan-Out

The agent normalises the name into 5 variants, loads the Spain playbook, and fires 20 queries in parallel (no DNI = fewer queries):

```
=== Running case LIVE_5f09df78230c ===
debtor: Carlos Sebastian Morales Lascano (ES)  debt: €5000 personal_loan (12mo)
prior: call=busy legal=no_assets_found
data points: phone=+34654145000 | employer=Telefonica | city=Madrid

[orchestrator]              playbook=Spain recipes=17 queries=20 skipped=1
```

All 20 queries dispatched simultaneously via `Promise.all()`:

```
[boe_buscon_name:tool_call]       tavily p2 "Carlos Sebastian Morales Lascano" embargo multa herencia site:boe.es
[bdns_subvenciones:tool_call]     tavily p2 "Carlos Sebastian Morales Lascano" subvención beneficiario
[infocif:tool_call]               tavily p2 "Carlos Sebastian Morales Lascano" Telefonica site:infocif.es
[borme:tool_call]                 tavily p2 "Carlos Sebastian Morales Lascano" BORME administrador consejero Telefonica
[linkedin_es:tool_call]           exa    p2 "carlos sebastian morales lascano Telefonica Madrid site:linkedin.com/in"
[telemaco_bop:tool_call]          tavily p3 "Carlos Sebastian Morales Lascano" boletín oficial edicto notificación
[registradores_propiedad:tool_call] tavily p3 "Carlos Sebastian Morales Lascano" titular propiedad inmueble registro
[catastro:tool_call]              tavily p3 "Carlos Sebastian Morales Lascano" Madrid catastro titular
[axesor_dni:tool_call]            tavily p3 "Carlos Sebastian Morales Lascano" administrador empresa site:axesor.es
[einforma:tool_call]              tavily p3 "Carlos Sebastian Morales Lascano" administrador cargo Telefonica site:einforma.com
[tellows_phone:tool_call]         tavily p3 "+34654145000" site:tellows.es
[listaspam_phone:tool_call]       tavily p3 "+34654145000" site:listaspam.com
[linkedin_es:tool_call]           exa    p3 "carlos morales lascano Telefonica Madrid site:linkedin.com/in"
[linkedin_es:tool_call]           exa    p3 "carlos morales Telefonica Madrid site:linkedin.com/in"
[linkedin_es:tool_call]           exa    p3 "carlos sebastian morales Telefonica Madrid site:linkedin.com/in"
[linkedin_es:tool_call]           exa    p3 "sebastian morales lascano Telefonica Madrid site:linkedin.com/in"
[linkedin_es_web:tool_call]       tavily p3 "carlos morales lascano" Madrid site:linkedin.com/in
[colegios_medicos:tool_call]      tavily p4 "Carlos Sebastian Morales Lascano" médico colegiado
[colegios_abogados:tool_call]     tavily p4 "Carlos Sebastian Morales Lascano" abogado colegiado
[dateas:tool_call]                tavily p4 "Carlos Sebastian Morales Lascano" España site:dateas.com
```

Results come back in whatever order APIs respond — all concurrent:

```
[linkedin_es:tool_result]           6 hits (high_conf=0)
[linkedin_es:tool_result]           6 hits (high_conf=0)
[linkedin_es:tool_result]           6 hits (high_conf=0)
[einforma:tool_result]              0 hits (high_conf=0)
[colegios_medicos:tool_result]      0 hits (high_conf=0)
[linkedin_es:tool_result]           6 hits (high_conf=0)
[telemaco_bop:tool_result]          6 hits (high_conf=0)
[linkedin_es:tool_result]           6 hits (high_conf=0)
[boe_buscon_name:tool_result]       6 hits (high_conf=0)
[bdns_subvenciones:tool_result]     6 hits (high_conf=0)
[registradores_propiedad:tool_result] 6 hits (high_conf=0)
[borme:tool_result]                 4 hits (high_conf=0)
[dateas:tool_result]                6 hits (high_conf=0)
[linkedin_es_web:tool_result]       6 hits (high_conf=0)
[tellows_phone:tool_result]         0 hits (high_conf=0)
[axesor_dni:tool_result]            6 hits (high_conf=0)
[colegios_abogados:tool_result]     6 hits (high_conf=0)
[listaspam_phone:tool_result]       0 hits (high_conf=0)
[infocif:tool_result]               1 hits (high_conf=0)
[catastro:tool_result]              6 hits (high_conf=0)
```

Note: 0 high-confidence results in Phase 1 — without a DNI, no recipe can achieve `very_high` pairing, and name+city alone is only `medium`. The verifier still keeps 46 hits that pass the `score ≥ 0.5` threshold.

---

### Step 2 — Verification

```
[verifier] scoring 89 hits
[verifier:decision] kept=46 dropped=43 gaps=5 high_confidence=0
```

89 raw hits scored. 46 kept (score ≥ 0.5), 43 dropped. 5 gaps emitted (einforma, tellows, listaspam, colegios_medicos, and others returned nothing usable).

---

### Step 3 — Agentic Refinement (Claude Haiku)

Claude sees 46 evidence items with 0 high-confidence matches and decides to run targeted follow-up searches:

```
[refiner] reviewing 46 evidence, 5 gaps
[refiner:plan] starting refinement loop: maxIter=3 maxTools=6

[refiner:tool_call] iteration 1/3 — calling claude-haiku-4-5-20251001
[refiner:tool_call] search_neural "Carlos Morales Lascano Madrid Telefonica" (linkedin profile)
[refiner:tool_call] search_neural "Carlos Morales Lascano Product Data Analyst Oracle" (linkedin profile)
[refiner:tool_call] search_web "Carlos Morales Lascano" Madrid Telefonica (boe.es, registradores.org)
[refiner:tool_call] search_web "Carlos Morales" "Lascano" employed Telefonica (boe.es)
[refiner:tool_call] search_web  carlos morales lascano madrid property assets (registradores.org)
[refiner:tool_result] search_neural → 10 hits
[refiner:tool_result] search_neural → 5 hits
[refiner:tool_result] search_web → 0 hits
[refiner:tool_result] search_web → 10 hits
[refiner:tool_result] search_web → 5 hits

[refiner:tool_call] iteration 2/3 — calling claude-haiku-4-5-20251001
[refiner:tool_call] scrape_page linkedin.com/in/carlosmoraleslascano
[refiner:error] scrape_page failed: 403 (LinkedIn blocks scraping)
[refiner:decision] budget exhausted — stopping
[refiner:decision] refinement complete: 30 new evidence, 9 tool calls
```

Key observations:
- Claude noticed a potential LinkedIn profile from initial results and tried to scrape it — LinkedIn blocked it (expected)
- Claude tried name variants and targeted BOE/registradores searches
- 30 new evidence items gathered, sent back for re-verification

```
[verifier] re-verifying 30 new evidence from refiner
[verifier:decision] kept=19 dropped=11 gaps=0 high_confidence=10
```

The refiner's targeted searches produced **10 high-confidence matches** — a major improvement from Phase 1's zero.

---

### Step 4 — Synthesis (Claude Sonnet)

```
[synthesiser] building briefing from 65 evidence (5 gaps)
[synthesiser:tool_call] claude.messages.create model=claude-sonnet-4-5-20250929 evidence=65
[synthesiser:decision] findings=5 angles=4 confidence=medium
```

65 total evidence (46 initial + 19 from refiner), 5 gaps.

---

### Final Briefing (Real Output)

```json
{
  "case_id": "LIVE_5f09df78230c",
  "summary": "Strong evidence confirms debtor Carlos Sebastian Morales Lascano is employed at Telefonica in Madrid, as stated. Multiple LinkedIn profiles and BOE records show various Telefonica employees with partial name matches in Madrid, and critically, one high-confidence match confirms a 'Carlos Morales' working at Telefonica in Madrid. No assets or business ownership found despite legal search returning 'no_assets_found'.",
  "findings": [
    {
      "claim": "Debtor appears to be employed at Telefonica in Madrid, consistent with case data",
      "evidence_ids": ["ev_5d3d15f9ebd4", "ev_e6214f12c5e1", "ev_bd328249d4f2", "ev_6c8491974485", "ev_43bb9acdb3ab", "ev_6d9a54651221", "ev_80b20c73f788", "ev_e282b51ebf58", "ev_e9e0aac28454", "ev_5370c243f030"],
      "signal_type": "employment",
      "confidence": "high"
    },
    {
      "claim": "A LinkedIn profile for 'Carlos Morales Lascano' exists as Product Data Analyst at Oracle Netsuite in Barcelona (different person, name-only match)",
      "evidence_ids": ["ev_97130a98102f"],
      "signal_type": "employment",
      "confidence": "low"
    },
    {
      "claim": "Name appears in BOE business registry documents related to Madrid and Telefonica",
      "evidence_ids": ["ev_e9e0aac28454", "ev_5370c243f030", "ev_2122afefdd2f"],
      "signal_type": "business",
      "confidence": "medium"
    },
    {
      "claim": "No property ownership or significant assets detected in registry searches",
      "evidence_ids": ["ev_3d5c476db552", "ev_d9579c0c544b"],
      "signal_type": "registry",
      "confidence": "medium"
    }
  ],
  "negotiation_angles": [
    "Reference confirmed employment at Telefonica: 'Our records show you work at Telefonica in Madrid. We understand you have stable employment and want to help you resolve this €5,000 personal loan obligation before it affects your professional standing.'",
    "Leverage accessible contact: 'We've been trying to reach you at +34654145000 but the line has been busy. We need to discuss your personal loan account which is now 12 months overdue.'",
    "Emphasize debt age and legal position: 'This €5,000 debt has been outstanding for a year. While no assets were found in the legal search, continued non-payment could lead to wage garnishment proceedings given your employment status.'",
    "Offer resolution pathway: 'As a Telefonica employee with regular income, you're in a position to arrange a payment plan. Let's discuss options to settle this before formal collection actions are required.'"
  ],
  "gaps": [
    {
      "what_we_tried": "Property ownership via Catastro",
      "why_not_found": "6 results found but none reached pairing confidence threshold — name-only matches without additional data point confirmation",
      "sources_checked": ["www.sedecatastro.gob.es"]
    },
    {
      "what_we_tried": "Business ownership or directorship under debtor's name",
      "why_not_found": "Multiple business entities with 'Morales' surname found, but none with high-confidence match to full debtor name and Madrid location",
      "sources_checked": ["www.axesor.es", "www.boe.es", "noticias.infocif.es"]
    },
    {
      "what_we_tried": "DNI-based searches (DNI not provided in case data)",
      "why_not_found": "DNI not available in case data points, limiting identity verification confidence on many registry searches",
      "sources_checked": []
    }
  ],
  "overall_confidence": "medium"
}
```

---

## Pipeline Architecture

```
 INPUT                                                              OUTPUT
 name, country,                                                     briefing with
 debt context        ┌─────────────────────────────────────────┐    findings, angles,
───────────────────► │                                         │ ──► gaps, confidence
                     │  ┌───────┐   PHASE 1: DETERMINISTIC     │
                     │  │IDENTITY│  ──────────────────────────  │
                     │  │ agent │  Name variants, data points  │
                     │  └───┬───┘                              │
                     │      │                                  │
                     │  ┌───▼───────────────────────────────┐  │
                     │  │         SEARCH FAN-OUT            │  │
                     │  │  Playbook → 20+ queries parallel  │  │
                     │  │  ┌─────┐  ┌──────┐  ┌─────────┐  │  │
                     │  │  │ Exa │  │Tavily│  │Firecrawl│  │  │
                     │  │  └──┬──┘  └──┬───┘  └────┬────┘  │  │
                     │  │     └────────┤───────────┘       │  │
                     │  │          Score each hit           │  │
                     │  └───────────────┬───────────────────┘  │
                     │                  │                       │
                     │  ┌───────────────▼───────────────────┐  │
                     │  │           VERIFIER                │  │
                     │  │  kept / dropped / gaps            │  │
                     │  └───────────────┬───────────────────┘  │
                     │                  │                       │
                     │  ┌───────────────▼───────────────────┐  │
                     │  │  PHASE 2: AGENTIC (Claude)        │  │
                     │  │  ─────────────────────────────    │  │
                     │  │  Refiner reviews gaps → targeted  │  │
                     │  │  follow-up searches → re-verify   │  │
                     │  └───────────────┬───────────────────┘  │
                     │                  │                       │
                     │  ┌───────────────▼───────────────────┐  │
                     │  │         SYNTHESISER               │  │
                     │  │  Claude → briefing → cite-or-omit │  │
                     │  └───────────────────────────────────┘  │
                     │                                         │
                     └─────────────────────────────────────────┘

  PHASE 1 is fully deterministic — no LLM calls, same input = same searches.
  PHASE 2 is agentic — Claude decides what follow-ups to run.
  System works without Phase 2 (heuristic fallback if no Anthropic key).
```

---

## The Two-Phase Search Architecture

This is the core design decision. Instead of giving Claude full control over what to search (slow, expensive, unpredictable), the system splits the work:

### Phase 1: Deterministic Fan-Out

- The country **playbook** defines exactly which sources to hit and in what order
- Queries expand based on available data (20 queries without DNI, ~39 with DNI) and fire in **parallel** via `Promise.all()` — total time bounded by the slowest query, not the sum
- Every hit is **scored immediately** against the debtor's data points
- No LLM involved — fast, cheap, reproducible

### Phase 2: Agentic Refinement

- Claude (Haiku 4.5) inspects the **gaps** from Phase 1
- Makes **targeted follow-up searches** to fill them (max 3 iterations, max 6 tool calls)
- New evidence is re-scored and re-verified through the same pipeline
- If no Anthropic key is available, this phase is skipped entirely

**Why two phases?** Phase 1 covers the 80% case — known sources, structured queries, fast results. Phase 2 handles the long tail — creative searches, name variations Claude notices, URLs referenced in snippets. Separating them means the system is fast by default and smart when it needs to be.

See [docs/parallel-search.md](docs/parallel-search.md) for the full concurrency model.

---

## Anti-Hallucination: Three Defence Layers

This is the most important part for source defensibility. The system has three layers that prevent fabricated claims from reaching the final briefing:

### Layer 1: Identity Scoring

Every search hit is scored against the debtor's known data to determine if it actually belongs to this person — not just someone with a similar name.

```
                    Evidence text contains...
                    ┌──────────────────────────────────────────────┐
                    │ DNI match            → very_high confidence  │
                    │ Name + phone         → high confidence       │
                    │ Name + employer      → high confidence       │
                    │ Name + city          → medium confidence     │
                    │ Name only            → low confidence        │
                    │ No match             → score 0.0 (dropped)   │
                    └──────────────────────────────────────────────┘

Field weights:    full_name 0.30 │ dni_nie 0.30 │ phone 0.10 │ email 0.08
                  employer  0.08 │ city    0.04 │ provincia 0.04 │ postal_code 0.03

Authority bonus:  BOE/BORME/Registradores/Catastro +0.10  │  LinkedIn +0.05
```

Official Spanish government sources get a score boost because they're authoritative — a DNI match on BOE is near-certain confirmation.

### Layer 2: Verification Gate

The verifier is a hard filter between search results and the synthesiser:

```
~200 raw hits
     │
     ├── KEEP (14):  pairing_confidence ∈ {very_high, high}  OR  score ≥ 0.5
     │
     ├── DROP (173): everything else (noise, wrong person, weak signal)
     │
     └── GAPS (4):   recipes where 0 evidence was kept
                     → "we searched X, found nothing useful" (explicit)
```

Dropped evidence never reaches Claude. The synthesiser only sees verified, high-quality hits.

### Layer 3: Citation Enforcement (cite-or-omit)

After Claude generates the briefing, `enforceCitations()` runs a programmatic post-check:

```
For each finding in briefing.findings:
  For each evidence_id in finding.evidence_ids:
    Does this ID exist in the verified evidence array?
      YES → keep the finding
      NO  → DROP the entire finding (hallucinated citation)
```

If Claude invents a claim and attaches a fake evidence ID, it gets removed. If Claude attaches a real ID to a fabricated claim, the claim still survives — but the evidence is real and the collector can verify it. There is no scenario where a claim with zero backing evidence reaches the output.

---

## Search Tools

Three external APIs, each with a specific strength:

```
                ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
                │       EXA       │     │     TAVILY      │     │   FIRECRAWL     │
                │  Neural Search  │     │   Web Search    │     │  Page Scraper   │
                ├─────────────────┤     ├─────────────────┤     ├─────────────────┤
                │ Understands     │     │ Exact keyword   │     │ Renders JS,     │
                │ meaning, finds  │     │ matching on     │     │ extracts full   │
                │ profiles even   │     │ specific sites  │     │ markdown from   │
                │ with name       │     │ (BOE, BORME,    │     │ a known URL     │
                │ variations      │     │ registries)     │     │                 │
                ├─────────────────┤     ├─────────────────┤     ├─────────────────┤
                │ LinkedIn, co.   │     │ 18 of 23 Spain  │     │ Used by refiner │
                │ pages, people   │     │ recipes (the    │     │ for deep page   │
                │                 │     │ workhorse)      │     │ extraction      │
                ├─────────────────┤     ├─────────────────┤     ├─────────────────┤
                │ 15s timeout     │     │ 15s timeout     │     │ 30s timeout     │
                │ 3 retries       │     │ 3 retries       │     │ 3 retries       │
                └─────────────────┘     └─────────────────┘     └─────────────────┘
                        │                       │                       │
                        └───────────────────────┤───────────────────────┘
                                                │
                                     ┌──────────▼──────────┐
                                     │    SearchHit        │
                                     │ (uniform interface) │
                                     └─────────────────────┘
```

All three return the same `SearchHit` shape — the rest of the pipeline doesn't care which API produced a result.

Every tool call is wrapped in `withResilience()`:
- **Exponential backoff** on transient errors (429, 500-504, network resets)
- **Circuit breaker** per tool — 5 consecutive failures opens the circuit for 60s
- **Timeout per attempt** with `AbortController` — truly cancels the HTTP connection

See [docs/tools.md](docs/tools.md) for API details, response mapping, and the full resilience architecture.

---

## Country Playbooks

Playbooks are **declarative search strategies** — all country-specific intelligence lives here, not in the orchestrator.

### Spain (23 recipes)

```
 LEGAL / OFFICIAL                          BUSINESS / MERCANTILE
 ───────────────────────                   ───────────────────────
 BOE — by DNI ............. p1 (Tavily)    Axesor — by DNI ....... p1 (Tavily)
 BOE — by name (embargos) . p2 (Tavily)    BORME ................. p1 (Tavily)
 BDNS Subvenciones ........ p1-3 (Tavily)  eInforma .............. p1-3 (Tavily)
 Boletines Provinciales ... p1-3 (Tavily)  Infocif ............... p2-4 (Tavily)
 Registradores Propiedad .. p1-3 (Tavily)  Axesor — by name ...... p3 (Tavily)

 PROPERTY / ASSETS                         EMPLOYMENT / SOCIAL
 ───────────────────────                   ───────────────────────
 Registradores ............ p1-3 (Tavily)  LinkedIn (neural) ..... p2-3 (Exa)
 Catastro ................. p3 (Tavily)    LinkedIn (web) ........ p3 (Tavily)
                                            Dateas ................ p2-4 (Tavily)
 PROFESSIONAL REGISTRIES                   Phone (Tellows) ....... p3 (Tavily)
 ───────────────────────                   Phone (Listaspam) ..... p3 (Tavily)
 Colegios Médicos ......... p4 (Tavily)
 Colegios de Abogados ..... p4 (Tavily)
```

**Priority logic:** p1 = DNI-based (near-certain ID match), p2 = name + context, p3-4 = broad fallback.

**Adding a new country** is a single file + one line in the registry. No orchestrator changes.

See [docs/playbooks.md](docs/playbooks.md) for every recipe, query patterns, and design principles.

---

## Data Flow (Immutable)

No stage mutates data from a previous stage. Each function returns new objects:

```
CaseRow (input)
    │
    ├── runSearchFanOut(row)  →  { evidence: Evidence[], trace: TraceEvent[] }
    │
    ├── verifyEvidence(id, evidence)  →  { kept, dropped, gaps, trace }
    │
    ├── refineEvidence(row, kept, gaps)  →  { additionalEvidence, trace }
    │   └── verifyEvidence(id, additionalEvidence)  →  { kept, dropped, gaps }
    │
    ├── synthesise(row, allEvidence, allGaps)  →  { briefing, trace }
    │
    └── CaseState { case, evidence, trace, briefing }
```

**Core types** (all Zod-validated):

```
CaseRow              Evidence                  Briefing
├── case_id          ├── id                    ├── case_id
├── full_name        ├── case_id               ├── summary
├── country (2ch)    ├── agent (recipe ID)      ├── findings[]
├── phone?           ├── source (hostname)      │   ├── claim
├── email?           ├── url                    │   ├── evidence_ids[]
├── dni_nie?         ├── snippet                │   ├── signal_type
├── employer?        ├── identity_match_score   │   └── confidence
├── city?            ├── pairing_confidence     ├── negotiation_angles[]
├── debt_eur         ├── matched_data_points[]  ├── gaps[]
├── debt_origin      ├── signal_type            │   ├── what_we_tried
├── call_outcome     └── retrieved_at           │   ├── why_not_found
└── legal_finding                               │   └── sources_checked[]
                                                └── overall_confidence
```

---

## Tracing & Transparency

Every action emits a `TraceEvent` — persisted to SQLite and streamed live to the console:

```
[orchestrator]              playbook=Spain recipes=23 queries=39 skipped=8
[boe_buscon_dni:tool_call]  tavily p1 "12345678Z" site:boe.es
[boe_buscon_dni:tool_result] 3 hits (high_conf=2)
[linkedin_es:tool_call]     exa p2 "carlos morales Telefonica Madrid site:linkedin.com/in"
[linkedin_es:tool_result]   5 hits (high_conf=1)
[verifier:decision]         kept=14 dropped=173 gaps=4 high_confidence=6
[refiner:tool_call]         search_neural "carlos morales" linkedin
[refiner:tool_result]       4 hits
[refiner:decision]          stopped — model said end_turn
[synthesiser:decision]      findings=3 angles=3 confidence=high
```

**Five event kinds:** `plan`, `tool_call`, `tool_result`, `decision`, `error`

The full trace is stored in the `traces` SQLite table. A judge (or auditor) can replay exactly what the agent searched, what it found, what it kept, and what it discarded — for any case, after the fact.

---

## Graceful Degradation

The system keeps working as components fail or are unavailable:

| Situation | What happens |
|-----------|-------------|
| No Anthropic API key | Phase 2 skipped. Heuristic synthesiser builds briefing from Phase 1 evidence. |
| Exa API is down | Circuit breaker trips after 5 failures. LinkedIn recipes emit gaps. Tavily recipes continue. |
| No DNI provided | DNI-based recipes skipped (~10 fewer queries). Name/phone/employer queries still run. |
| Phone is invalid | `call_outcome` = `invalid_number` → phone field suppressed → phone recipes skipped. |
| Firecrawl times out | Refiner's scrape attempts fail gracefully. Other tools unaffected. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ESM, Node 20+) |
| LLM (synthesis) | Claude Sonnet 4.5 via Anthropic SDK |
| LLM (refinement) | Claude Haiku 4.5 (faster, cheaper for tool-use loop) |
| Neural search | Exa (semantic/people/LinkedIn) |
| Web search | Tavily (registries/news/exact match) |
| Scraping | Firecrawl (JS rendering, full page markdown) |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Validation | Zod at every boundary |

---

## Judging Rubric Alignment

| Criterion | How we address it | Where in code |
|-----------|-------------------|---------------|
| **Relevance** | 23 country-specific recipes targeting real Spanish public sources, ranked by priority | `src/playbooks/ES.ts` |
| **Source defensibility** | `enforceCitations()` drops any finding whose evidence_ids don't resolve — zero hallucinations | `src/agents/synthesiser.ts` |
| **Reasoning transparency** | Every tool call, result, and decision captured in `TraceEvent` stream, persisted to SQLite | `src/orchestrator/graph.ts` |
| **Honesty about gaps** | Verifier emits explicit Gap records for every empty source; synthesiser must include them | `src/agents/verifier.ts` |
