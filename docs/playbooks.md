# Country Playbooks — Deep Dive

Playbooks are the system's strategy layer. They define **what to search, where, and in what order** for each country. The orchestrator and tools are generic — all the country-specific intelligence lives in playbooks.

---

## How Playbooks Work

### The Playbook Structure

```typescript
interface Playbook {
  country: string;       // ISO 2-letter code (ES, FR, DE, ...)
  label: string;         // Human-readable name
  recipes: SourceRecipe[];
}
```

A playbook is a list of **recipes**. Each recipe represents a specific data source + search strategy combination.

### What is a Recipe?

```typescript
interface SourceRecipe {
  id: string;              // Unique ID (e.g., "boe_buscon_dni")
  label: string;           // Human-readable description
  signal_type: SignalType;  // What kind of info this finds (legal, business, employment, ...)
  tool: "exa" | "tavily" | "firecrawl";  // Which search API to use
  can_verify_pairs: string[][];           // What field pairs this source can confirm
  buildQueries: (ctx: PlaybookCtx) => QueryVariant[];  // Generates actual search queries
}
```

The `buildQueries` function is where the magic happens — it receives the normalised debtor context and generates concrete search queries.

### What is a QueryVariant?

```typescript
interface QueryVariant {
  query: string;              // The actual search string
  includeDomains?: string[];  // Restrict to specific domains
  excludeDomains?: string[];  // Exclude specific domains
  priority: number;           // 1 = highest priority
  requires_fields: string[];  // Skip if these fields are missing
  target_pairs: string[][];   // Which field combos this verifies
}
```

### The Context Object

Every `buildQueries` function receives a `PlaybookCtx` — the normalised debtor profile:

```typescript
interface PlaybookCtx {
  full_name: string;           // Normalised name
  name_variants: string[];     // All name forms (see identity.ts)
  country: string;             // ISO code
  city?: string;
  postal_code?: string;
  phoneHint?: string;          // Country prefix (+34, +351, ...)
  phone?: string;              // Full phone number
  email?: string;
  dni_nie?: string;            // Full DNI/NIE
  dni_no_letter?: string;      // DNI without trailing letter
  provincia?: string;
  employer?: string;
  autonomo?: boolean;          // Self-employed flag
  has_dni: boolean;            // Quick availability checks
  has_email: boolean;
  has_phone: boolean;
  has_employer: boolean;
}
```

---

## Country Routing

**File:** `src/playbooks/index.ts`

```typescript
const registry: Record<string, Playbook> = { ES };

export function getPlaybook(country: string): Playbook {
  return registry[country.toUpperCase()] ?? DEFAULT_PLAYBOOK;
}
```

Simple lookup: match the country code, or fall back to the generic playbook.

---

## Spain Playbook (ES) — All 23 Recipes

**File:** `src/playbooks/ES.ts`

The Spain playbook targets real Spanish public data sources. Recipes are organised by category.

### Category 1: Legal / Official Sources

#### `boe_buscon_dni` — BOE by DNI

```
Tool:     Tavily (exact keyword match)
Signal:   legal
Priority: 1 (highest)
Requires: dni_nie
Queries:
  → "12345678Z" site:boe.es
  → "12345678" "Carlos Morales" site:boe.es
Verifies: [full_name + dni_nie]
```

**What it finds:** Government gazette entries — embargos, legal notifications, public proceedings where the debtor's DNI appears. A DNI match on BOE is extremely strong evidence.

#### `boe_buscon_name` — BOE by Name

```
Tool:     Tavily
Signal:   legal
Priority: 2
Requires: (none)
Queries:
  → "Carlos Morales Lascano" embargo multa herencia site:boe.es
Verifies: [full_name + provincia]
```

**What it finds:** Embargos, fines, inheritance proceedings by name. Lower confidence than DNI (name collisions possible).

#### `bdns_subvenciones` — National Grants Database

```
Tool:     Tavily
Signal:   subsidy
Priority: 1 (DNI) / 2-3 (name)
Requires: dni_nie (for p1 variant)
Queries:
  → "12345678Z" site:pap.hacienda.gob.es        (if DNI available)
  → "Carlos Morales" subvención beneficiario Madrid
Verifies: [full_name + dni_nie] or [full_name + provincia]
```

**What it finds:** Public grant recipients. If a debtor received a government subsidy, they have financial activity and possibly assets.

#### `telemaco_bop` — Provincial Bulletins

```
Tool:     Tavily
Signal:   legal
Priority: 1 (DNI) / 3 (name)
Queries:
  → "12345678Z" boletín oficial provincial
  → "Carlos Morales" boletín oficial Madrid edicto notificación
Verifies: [full_name + dni_nie] or [full_name + provincia]
```

**What it finds:** Provincial official bulletins — property seizures, legal notifications, municipal proceedings.

---

### Category 2: Property / Registry Sources

#### `registradores_propiedad` — Property Registry

```
Tool:     Tavily
Signal:   registry
Priority: 1 (DNI) / 3 (name)
Queries:
  → "12345678Z" titular propiedad registradores     (sites: registradores.org)
  → "Carlos Morales" titular propiedad inmueble registro
Verifies: [full_name + dni_nie] or [full_name + city]
```

**What it finds:** Property ownership records. Critical for asset recovery — confirms the debtor owns real estate.

#### `catastro` — Cadastral Records

```
Tool:     Tavily
Signal:   asset
Priority: 3
Requires: (none)
Queries:
  → "Carlos Morales" Madrid catastro titular     (sites: sedecatastro.gob.es)
Verifies: [full_name + city]
```

**What it finds:** Land and property records from the national cadastral office.

---

### Category 3: Business / Mercantile Sources

#### `axesor_dni` — Axesor by DNI

```
Tool:     Tavily
Signal:   business
Priority: 1 (DNI) / 3 (name)
Queries:
  → "12345678Z" administrador apoderado site:axesor.es
  → "Carlos Morales" administrador empresa site:axesor.es
Verifies: [full_name + dni_nie] or [full_name + employer]
```

**What it finds:** Business intelligence — company directorships, power of attorney, corporate roles.

#### `einforma` — Company Officer Search

```
Tool:     Tavily
Signal:   business
Priority: 1 (DNI) / 3 (name)
Queries:
  → "12345678Z" cargo empresa site:einforma.com
  → "Carlos Morales" administrador cargo Telefonica site:einforma.com
Verifies: [full_name + dni_nie] or [full_name + employer]
```

**What it finds:** Company officer listings, corporate positions, active businesses.

#### `infocif` — Company Networks

```
Tool:     Tavily
Signal:   business
Priority: 2 (if employer known) / 4 (fallback)
Requires: (none)
Queries:
  → "Carlos Morales" Telefonica site:infocif.es
Verifies: [full_name + employer]
```

**What it finds:** Company network relationships, business connections.

#### `borme` — Official Commerce Registry

```
Tool:     Tavily
Signal:   business
Priority: 1 (DNI) / 2 (name)
Queries:
  → "12345678Z" BORME registro mercantil          (sites: boe.es, borme.es)
  → "Carlos Morales" BORME administrador consejero Telefonica
Verifies: [full_name + dni_nie] or [full_name + employer]
```

**What it finds:** Official mercantile registry entries — company formations, director appointments, dissolutions. BORME is the official source of truth for Spanish business records.

---

### Category 4: Professional Registries

#### `colegios_medicos` — Medical College

```
Tool:     Tavily
Signal:   employment
Priority: 4
Queries:
  → "Carlos Morales" médico colegiado Madrid    (sites: cgcom.es)
Verifies: [full_name + provincia]
```

**What it finds:** Registered medical professionals. If the debtor is a doctor, this confirms active employment and income.

#### `colegios_abogados` — Bar Association

```
Tool:     Tavily
Signal:   employment
Priority: 4
Queries:
  → "Carlos Morales" abogado colegiado Madrid   (sites: abogacia.es, icam.es)
Verifies: [full_name + provincia]
```

**What it finds:** Registered lawyers. Confirms legal profession and likely stable income.

---

### Category 5: Phone / Email Verification

#### `tellows_phone` — Reverse Phone Lookup

```
Tool:     Tavily
Signal:   social
Priority: 3
Requires: phone
Queries:
  → "34600111222" site:tellows.es
Verifies: [full_name + phone]
```

**What it finds:** Phone number reports, caller ID information. Helps verify if the phone number is actually linked to the debtor.

#### `listaspam_phone` — Phone Database

```
Tool:     Tavily
Signal:   social
Priority: 3
Requires: phone
Queries:
  → "34600111222" site:listaspam.com
Verifies: [full_name + phone]
```

---

### Category 6: Employment / Social

#### `linkedin_es` — LinkedIn via Neural Search

```
Tool:     Exa (neural)
Signal:   employment
Priority: 2 (exact name) / 3 (variants)
Requires: (none)
Queries:  (one per name variant)
  → "carlos sebastian morales lascano Telefonica Madrid site:linkedin.com/in"
  → "carlos morales lascano Telefonica Madrid site:linkedin.com/in"
  → "carlos morales Telefonica Madrid site:linkedin.com/in"
Verifies: [full_name + employer], [full_name + city]
```

**What it finds:** LinkedIn profiles. The most important employment signal. Uses **Exa's neural search** because it understands semantics — a profile saying "Ingeniero en Telefonica" still matches even without the exact query string.

**Name variant strategy:** People on LinkedIn often use shortened names. A 4-token Spanish name generates 5 variants. Each gets its own query, with deduplication:

```typescript
const seen = new Set<string>();
for (const variant of ctx.name_variants) {
  const q = `${variant} ${employer} ${location} site:linkedin.com/in`;
  if (seen.has(q)) continue;
  seen.add(q);
  queries.push({ query: q, priority: variant === ctx.full_name.toLowerCase() ? 2 : 3, ... });
}
```

#### `linkedin_es_web` — LinkedIn via Web Search

```
Tool:     Tavily (web)
Signal:   employment
Priority: 3
Requires: (none)
Queries:
  → "carlos morales lascano" Madrid site:linkedin.com/in
Verifies: [full_name + employer], [full_name + city]
```

**What it finds:** Same as above, but using traditional web search. Catches profiles that Exa's neural search misses. Uses the **shortest name variant** (most common on social platforms).

#### `dateas` — Aggregated Records

```
Tool:     Tavily
Signal:   other
Priority: 2 (DNI) / 4 (name)
Queries:
  → "12345678Z" site:dateas.com
  → "Carlos Morales" España site:dateas.com
Verifies: [full_name + dni_nie] or [full_name + city]
```

**What it finds:** Aggregated public records from multiple Spanish sources.

---

## Query Expansion Example

For a debtor with full data (name, DNI, phone, employer, city, provincia):

```
Recipe                          Queries Generated  Priority
────────────────────────────────────────────────────────────
boe_buscon_dni                  2 (DNI, DNI+name)  p1
boe_buscon_name                 1 (name+keywords)  p2
bdns_subvenciones               2 (DNI, name)      p1, p3
telemaco_bop                    2 (DNI, name)      p1, p3
registradores_propiedad         2 (DNI, name)      p1, p3
catastro                        1 (name+city)      p3
axesor_dni                      2 (DNI, name)      p1, p3
einforma                        2 (DNI, name)      p1, p3
infocif                         1 (name+employer)  p2
borme                           2 (DNI, name)      p1, p2
colegios_medicos                1 (name+provincia) p4
colegios_abogados               1 (name+provincia) p4
tellows_phone                   1 (phone digits)   p3
listaspam_phone                 1 (phone digits)   p3
linkedin_es                     5 (per name var.)  p2-3
linkedin_es_web                 1 (short variant)  p3
dateas                          2 (DNI, name)      p2, p4
────────────────────────────────────────────────────────────
TOTAL                           ~29 queries
```

For a debtor with only name + country (no DNI, no phone):

```
Skip: boe_buscon_dni (needs DNI), axesor_dni p1 (needs DNI),
      tellows/listaspam (needs phone), etc.

TOTAL                           ~15 queries (DNI/phone recipes skipped)
```

---

## Default Playbook (Fallback)

**File:** `src/playbooks/default.ts`

Used when no country-specific playbook exists. 4 generic recipes:

| Recipe | Tool | Signal | Query |
|--------|------|--------|-------|
| `linkedin_generic` | Exa | employment | `"{name} site:linkedin.com/in {country}"` |
| `web_general` | Tavily | other | `"{name} {country} company director"` |
| `news_generic` | Tavily | news | `"{name} news"` |
| `social_generic` | Exa | social | `"{name} Instagram Facebook profile"` |

These cast a wide net but lack the precision of country-specific source targeting.

---

## How to Add a New Country

### 1. Create the Playbook File

```typescript
// src/playbooks/PT.ts (Portugal)
import type { Playbook, SourceRecipe } from "./types.js";

const recipes: SourceRecipe[] = [
  {
    id: "diario_republica",
    label: "Diário da República — Portuguese official gazette",
    signal_type: "legal",
    tool: "tavily",
    can_verify_pairs: [["full_name", "dni_nie"]],
    buildQueries: (ctx) => [
      {
        query: `"${ctx.full_name}" site:dre.pt`,
        includeDomains: ["dre.pt"],
        priority: 1,
        requires_fields: [],
        target_pairs: [["full_name", "city"]],
      },
    ],
  },
  {
    id: "racius",
    label: "Racius — Portuguese company registry",
    signal_type: "business",
    tool: "tavily",
    can_verify_pairs: [["full_name", "employer"]],
    buildQueries: (ctx) => [
      {
        query: `"${ctx.full_name}" gerente administrador site:racius.com`,
        includeDomains: ["racius.com"],
        priority: 2,
        requires_fields: [],
        target_pairs: [["full_name", "employer"]],
      },
    ],
  },
  // ... more Portuguese-specific recipes
];

export const PT: Playbook = {
  country: "PT",
  label: "Portugal",
  recipes,
};
```

### 2. Register It

```typescript
// src/playbooks/index.ts
import { ES } from "./ES.js";
import { PT } from "./PT.js";   // ← add import

const registry: Record<string, Playbook> = { ES, PT };  // ← add to registry
```

### 3. Done

No orchestrator, search agent, scorer, verifier, or synthesiser changes needed. The pipeline handles it automatically.

---

## Playbook Design Principles

### 1. Highest Priority = Highest Confidence

DNI-based searches are always priority 1. A DNI match is effectively a unique identifier — if `12345678Z` appears on a BOE page alongside a name, that's near-certain identity confirmation.

### 2. Multiple Tools per Source

LinkedIn is searched via both Exa (neural, `linkedin_es`) and Tavily (web, `linkedin_es_web`). Neural search finds semantically similar profiles; web search catches exact keyword matches. Using both maximises recall.

### 3. Name Variants for Social Sources

Social media profiles use inconsistent naming. The LinkedIn recipe fires one query per name variant:
- "Carlos Sebastian Morales Lascano" (full)
- "Carlos Morales Lascano" (drop middle name)
- "Carlos Morales" (shortest)
- "Carlos Sebastian Morales" (drop second surname)
- "Sebastian Morales Lascano" (drop first name)

### 4. Domain Pinning

Most recipes pin to specific domains (`includeDomains`) to reduce noise. A search for a common name like "Carlos Morales" on the open web returns garbage. Pinning to `boe.es` or `axesor.es` ensures results come from authoritative sources.

### 5. Conditional Query Generation

Recipes adapt to available data:

```typescript
buildQueries: (ctx) => {
  const queries = [];
  if (ctx.dni_nie) {
    queries.push({ query: `"${ctx.dni_nie}" site:boe.es`, priority: 1, requires_fields: ["dni_nie"], ... });
  }
  queries.push({ query: `"${ctx.full_name}" embargo site:boe.es`, priority: 2, requires_fields: [], ... });
  return queries;
}
```

If DNI is available, generate both a high-priority DNI query and a lower-priority name query. If not, only the name query runs.

### 6. Target Pairs Drive Scoring

Each query declares `target_pairs` — which field combinations it's designed to verify. The scorer uses these to compute `pairing_confidence`:

```
target_pairs: [["full_name", "dni_nie"]]
  → If both full_name AND dni_nie found in result text → very_high confidence

target_pairs: [["full_name", "employer"], ["full_name", "city"]]
  → If full_name + employer found → high confidence
  → If full_name + city found → medium confidence
```

This means the same search hit can have different confidence levels depending on which recipe found it, because different recipes claim different verification capabilities.
