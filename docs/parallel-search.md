# Parallel Search Fan-Out — Deep Dive

This document explains how the system dispatches 40+ search queries in parallel, scores every result, and funnels them into the verification pipeline.

---

## The Big Picture

```
    1 debtor input
         │
         ▼
    23 recipes (Spain playbook)
         │
         ▼
    ~47 queries (after variant expansion + field filtering)
         │
    ─────┼─────── Promise.all() ──────────────
    │    │    │    │    │    │    │    │    │
    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼
   q1   q2   q3   q4   q5  ...  q45  q46  q47
    │    │    │    │    │    │    │    │    │
    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼
  API  API  API  API  API  API  API  API  API
  call call call call call call call call call
    │    │    │    │    │    │    │    │    │
    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼
  score score score score score score score score score
    │    │    │    │    │    │    │    │    │
    ─────┼─────── results.flat() ─────────────
         │
         ▼
    Evidence[] (all results, scored)
```

Every query runs concurrently. There is no batching, no queue, no rate limiter between queries — they all fire at once. The resilience layer (retry + circuit breaker) handles failures at the individual query level.

---

## Step-by-Step Walkthrough

### Step 1: Load Playbook

**File:** `src/agents/search.ts:28-29`

```typescript
const playbook = getPlaybook(row.country);  // ES → Spain, fallback → generic
const ctx = adjustCtxForCallOutcome(buildPlaybookCtx(row), row.call_outcome);
```

`buildPlaybookCtx()` (from `identity.ts`) normalises the debtor's data into a `PlaybookCtx`:
- Generates name variants
- Normalises DNI, email, employer
- Detects phone→country hint
- Sets boolean flags: `has_dni`, `has_phone`, `has_email`, `has_employer`

`adjustCtxForCallOutcome()` checks the prior call outcome. If the phone is unreliable:

```typescript
const PHONE_UNRELIABLE_OUTCOMES = new Set(["invalid_number", "wrong_number", "not_debtor"]);

function adjustCtxForCallOutcome(ctx: PlaybookCtx, outcome: string): PlaybookCtx {
  if (!PHONE_UNRELIABLE_OUTCOMES.has(outcome)) return ctx;
  return { ...ctx, has_phone: false, phone: undefined };  // Immutable update
}
```

This prevents phone-based recipes from running with bad data.

### Step 2: Flatten Recipes into Queries

**File:** `src/agents/search.ts:36-51`

Each recipe's `buildQueries(ctx)` function generates one or more `QueryVariant`s based on the available data:

```typescript
const flatQueries: FlatQuery[] = [];
let skippedCount = 0;

for (const recipe of playbook.recipes) {
  const variants = recipe.buildQueries(ctx);
  if (variants.length === 0) { skippedCount++; continue; }

  for (const variant of variants) {
    const missing = variant.requires_fields.filter((f) => !hasField(ctx, f));
    if (missing.length > 0) { skippedCount++; continue; }
    flatQueries.push({ recipe, variant });
  }
}
```

**What happens here:**

1. Each of the 23 recipes generates 1-5 query variants depending on available data
2. Variants that require missing fields are skipped (e.g., DNI queries when no DNI provided)
3. The result is a flat list of `{ recipe, variant }` pairs

**Example:** For a debtor with DNI + name + employer in Spain, a typical run produces:

```
23 recipes → ~47 queries → ~8 skipped (missing fields) → 39 dispatched
```

### Step 3: Sort by Priority

```typescript
flatQueries.sort((a, b) => a.variant.priority - b.variant.priority);
```

Lower number = higher priority. This doesn't affect execution order (they all run in parallel), but it determines the order in the trace log, making debugging easier.

### Step 4: Parallel Dispatch

**File:** `src/agents/search.ts:74-78` — **This is the core parallelism.**

```typescript
const results = await Promise.all(
  flatQueries.map((fq) => runQuery(row, fq, dataPoints, trace)),
);

return { evidence: results.flat(), trace };
```

`Promise.all()` fires **every query simultaneously**. There is no sequential bottleneck — 39 HTTP requests go out at the same time.

### Step 5: Individual Query Execution

**File:** `src/agents/search.ts:90-160`

Each `runQuery()` call:

1. **Logs a trace event** (`tool_call`)
2. **Selects the right tool** based on the recipe:

```typescript
const hits =
  recipe.tool === "exa"
    ? await exaSearch(variant.query, { includeDomains: variant.includeDomains, numResults: 6 })
    : recipe.tool === "tavily"
      ? await tavilySearch(variant.query, { includeDomains: variant.includeDomains, maxResults: 6 })
      : [{ ...(await firecrawlScrape(variant.query)), snippet: "", source: safeHost(variant.query) }];
```

3. **Scores every hit** against the debtor's data:

```typescript
const evidence: Evidence[] = hits.map((h) => {
  const text = `${h.title ?? ""} ${"snippet" in h ? h.snippet : ""}`;
  const scoring = scoreEvidence(dataPoints, text, variant.target_pairs, h.source);
  return {
    id: newId("ev_"),
    case_id: row.case_id,
    agent: recipe.id,
    source: h.source,
    url: h.url,
    title: h.title,
    snippet: h.snippet,
    retrieved_at: h.retrieved_at,
    identity_match_score: scoring.total,
    signal_type: recipe.signal_type,
    matched_data_points: scoring.matchedFields,
    pairing_confidence: scoring.pairingConfidence,
    raw: h.raw,
  };
});
```

4. **Logs the result** (`tool_result`) with hit count and confidence breakdown
5. **Catches errors** gracefully — a failed query returns `[]`, not a crash

```typescript
catch (err) {
  trace.push({ ..., kind: "error", message: err.message });
  return [];  // Failed query → empty results, pipeline continues
}
```

---

## What Happens When Things Go Wrong

### Scenario: Exa API is Down

```
Query 1 (tavily, BOE)     → 3 hits ✓
Query 2 (tavily, BORME)   → 2 hits ✓
Query 3 (exa, LinkedIn)   → timeout → retry → retry → retry → 0 hits
Query 4 (exa, LinkedIn)   → timeout → retry → retry → retry → 0 hits
Query 5 (exa, LinkedIn)   → circuit OPEN → 0 hits (instant)
Query 6 (exa, LinkedIn)   → circuit OPEN → 0 hits (instant)
Query 7 (tavily, Axesor)  → 4 hits ✓
...
```

The circuit breaker kicks in after 5 consecutive Exa failures. All remaining Exa queries fail instantly (no wasted time). Tavily queries continue normally. The verifier will emit gaps for the LinkedIn recipes.

### Scenario: One Query Returns Garbage

```
Query (tavily, "Carlos Morales" site:boe.es) → 6 hits
  ├── Hit 1: BOE page with "Carlos Morales García" + DNI → score 0.95 ✓
  ├── Hit 2: BOE page with "María Morales" only → score 0.15 ✗
  ├── Hit 3: Unrelated page, no name match → score 0.0 ✗
  └── Hit 4: BOE page with "Carlos Morales" + Madrid → score 0.55 ✓
```

Every hit is scored. The verifier later filters: `score ≥ 0.5` or `pairing_confidence ∈ {high, very_high}`. Bad hits are dropped, not propagated.

### Scenario: Debtor Has No DNI

```
23 recipes → buildQueries(ctx) → many DNI variants → requires_fields: ["dni_nie"]

hasField(ctx, "dni_nie") → false → skipped!
```

DNI-based queries are never dispatched. Only name-based, phone-based, and employer-based queries run. Fewer queries = faster execution, but more gaps.

---

## Concurrency Diagram: Real Execution

```
Time ──────────────────────────────────────────────────────►

     ┌─ tavily: "12345678Z" site:boe.es ──────────── 1.2s ─┐
     ├─ tavily: "12345678Z" site:pap.hacienda.gob.es 0.9s ─┤
     ├─ tavily: "Carlos Morales" BORME ──────────── 1.1s ───┤
     ├─ tavily: "12345678Z" site:axesor.es ──────── 0.8s ───┤
     ├─ tavily: "Carlos Morales" site:einforma.com ─ 1.3s ──┤
     ├─ exa: "carlos morales Telefonica Madrid" ──── 2.1s ──┤
     ├─ exa: "carlos morales lascano Madrid" ─────── 1.8s ──┤
     ├─ tavily: "carlos morales" site:linkedin.com ─ 0.9s ──┤
     ├─ tavily: "12345678Z" boletín oficial ──────── 1.5s ──┤
     ├─ tavily: "12345678Z" site:registradores.org ─ 1.0s ──┤
     ├─ tavily: "Carlos Morales" catastro ─────────── 1.2s ─┤
     ├─ tavily: "600111222" site:tellows.es ─────── 0.7s ───┤
     ├─ tavily: "Carlos Morales" médico ──────────── 1.1s ──┤
     ├─ ... (25 more queries running concurrently) ─────────┤
     │                                                       │
     └───────── all done in ~2.1s (slowest query) ──────────┘
                         │
                         ▼
              Promise.all() resolves
                         │
                         ▼
              results.flat() → Evidence[]
              (~200 raw hits, each scored)
```

**Key insight:** Total wall-clock time is bounded by the **slowest single query**, not the sum. 39 queries that each take ~1s finish in ~2s total, not 39s.

---

## The Scoring Pipeline (per hit)

Each search hit is scored immediately, inside the `runQuery()` function:

```
SearchHit (from any tool)
    │
    ├── text = title + snippet
    │
    ├── scoreEvidence(dataPoints, text, target_pairs, source)
    │       │
    │       ├── 1. Normalize text (remove accents, lowercase)
    │       ├── 2. Check which debtor fields appear in text
    │       ├── 3. Check which target pairs are satisfied
    │       ├── 4. Compute pairing confidence
    │       ├── 5. Compute weighted score + authority bonus
    │       │
    │       └── Returns: { total, matchedFields, matchedPairs, pairingConfidence }
    │
    └── Evidence object (ready for verifier)
         ├── identity_match_score: 0.0 – 1.0
         ├── matched_data_points: ["full_name", "dni_nie", ...]
         ├── pairing_confidence: "very_high" | "high" | "medium" | "low"
         └── signal_type: from recipe (employment, business, legal, ...)
```

---

## After the Fan-Out: Verification

The evidence array (all hits, all scores) flows into the verifier:

```
Evidence[] (~200 items)
    │
    ▼
verifyEvidence(case_id, evidence)
    │
    ├── Filter: kept   ← confidence ∈ {very_high, high} OR score ≥ 0.5
    ├── Filter: dropped ← everything else
    ├── Gaps:  ← recipes with 0 kept evidence
    │
    ▼
VerifyResult
    ├── kept: Evidence[]              (~12-30 items)
    ├── dropped: Evidence[]           (~170-190 items)
    ├── gaps: Gap[]                   (~3-8 gaps)
    └── high_confidence_count: number
```

Then optionally into the refiner (Claude fills gaps) and finally into the synthesiser.

---

## Trace Output: What You See in the Console

```
[orchestrator] fan-out for Carlos Morales Lascano (ES)
playbook=Spain recipes=23 queries=39 skipped=8 dataPoints=6

[boe_buscon_dni:tool_call] tavily p1 "12345678Z" site:boe.es
[bdns_subvenciones:tool_call] tavily p1 "12345678Z" site:pap.hacienda.gob.es
[borme:tool_call] tavily p1 "12345678Z" BORME registro mercantil
[axesor_dni:tool_call] tavily p1 "12345678Z" administrador site:axesor.es
[registradores_propiedad:tool_call] tavily p1 "12345678Z" titular propiedad
[linkedin_es:tool_call] exa p2 "carlos morales lascano Telefonica Madrid site:linkedin.com/in"
[linkedin_es:tool_call] exa p3 "carlos morales Telefonica Madrid site:linkedin.com/in"
[boe_buscon_name:tool_call] tavily p2 "Carlos Morales Lascano" embargo multa herencia site:boe.es
[borme:tool_call] tavily p2 "Carlos Morales Lascano" BORME administrador
...

[boe_buscon_dni:tool_result] 3 hits (high_conf=2)
[bdns_subvenciones:tool_result] 1 hits (high_conf=1)
[linkedin_es:tool_result] 5 hits (high_conf=1)
[borme:tool_result] 2 hits (high_conf=2)
[axesor_dni:tool_result] 4 hits (high_conf=1)
[registradores_propiedad:tool_result] 0 hits (high_conf=0)
...

[verifier] scoring 187 hits
[verifier:decision] kept=14 dropped=173 gaps=4 high_confidence=6
```

Note how `tool_call` events interleave with `tool_result` events — they fire concurrently and resolve in whatever order the APIs respond.

---

## Why This Design

### Why `Promise.all()` instead of batching?

The APIs we use (Exa, Tavily, Firecrawl) are rate-limited per API key, not per connection. Sending 40 requests at once uses the same quota as sending them sequentially — but finishes in ~2s instead of ~40s.

### Why score inside `runQuery()` instead of after?

Each recipe knows its `target_pairs` — which fields it expects to verify. This context is lost if we defer scoring to later. By scoring immediately, the evidence object carries all the metadata the verifier and synthesiser need.

### Why `results.flat()` instead of a more structured collection?

The verifier doesn't care which recipe produced a piece of evidence — it only cares about the `identity_match_score` and `pairing_confidence`. Flattening keeps things simple. The `agent` field on each `Evidence` preserves the source recipe for gap detection.

### Why catch errors and return `[]` instead of failing?

One flaky API shouldn't tank the entire investigation. A Exa timeout on one LinkedIn query doesn't invalidate the 3 BORME hits and 2 BOE matches from Tavily. The circuit breaker prevents cascading timeouts, and the verifier emits gaps for recipes that produced no usable evidence.
