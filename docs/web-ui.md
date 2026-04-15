# Sherlock Web UI — Architecture & UX

The web frontend provides a real-time investigation dashboard built with Next.js 15 (App Router), Tailwind CSS, shadcn/ui (base-ui primitives), and Framer Motion. It connects to the Hono API server via Server-Sent Events (SSE) to stream agent activity as it happens.

---

## Running the UI

```bash
# Start both the API server (port 3001) and Next.js dev server (port 3000)
npm run dev:all

# Or run them separately
npm run server   # Hono API on :3001
npm run web      # Next.js on :3000
```

The API server requires a configured `.env` file (see root `CLAUDE.md` for required keys).

---

## UX Flow — Perplexity-style Investigation

The UI follows a **phased investigation pattern** inspired by Perplexity: immediate feedback on action, live progress indicators, then a clean final report with raw details hidden behind expandable sections.

```
┌─────────────────────────────────────────────────────┐
│  Phase 1: IMMEDIATE (0ms after click)               │
│  "Investigating Juan Garcia..."                     │
│  ━━━━━━━━░░░░░░░░  Starting investigation...        │
│                                                     │
│  Phase 2: SOURCES STREAM IN (2-30s)                 │
│  "Investigating Juan Garcia..."                     │
│  ━━━━━━━━━━━━░░░░  Verifying 12 sources             │
│  Sources: [boe.es] [axesor.es] [linkedin.com] ...   │
│                                                     │
│  Phase 3: REPORT (final)                            │
│  ✓ Investigation Complete  ● High confidence        │
│  Summary: Juan Garcia is employed at...             │
│  ┌─ Findings ─────────────────────────────────┐     │
│  │ • Employment at Telefonica (high)          │     │
│  │ • Property in Madrid (medium)              │     │
│  └────────────────────────────────────────────┘     │
│  ▸ View sources (12)                                │
│  ▸ View gaps (3)                                    │
│  ▸ View investigation trace (47 events)             │
└─────────────────────────────────────────────────────┘
```

---

## Layout

Split-panel dashboard:

| Region | Width | Content |
|--------|-------|---------|
| **Left panel** | 360px fixed | Case input form + investigation history sidebar |
| **Right panel** | Flex fill | Investigation view (phased UX described above) |
| **Header** | Full width | Sherlock branding |

---

## Component Architecture

### Page (`app/page.tsx`)

Top-level orchestrator. Manages:
- Live investigation state via `useInvestigation()` hook
- Historical case loading from the API (`/api/cases/:id`)
- Subject name tracking for the phase indicator
- Sidebar refresh on investigation completion

Delegates all right-panel rendering to `<InvestigationView>`.

### `useInvestigation` hook (`hooks/use-investigation.ts`)

Central state machine for a live investigation. Connects to the API via `fetch` + `ReadableStream` (SSE over POST).

**Returned state:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `idle \| running \| complete \| error` | Top-level status |
| `phase` | `connecting \| searching \| verifying \| refining \| synthesizing \| complete` | Derived from trace events |
| `trace` | `TraceEvent[]` | Raw trace events from the orchestrator |
| `caseState` | `CaseState \| null` | Final result (case + evidence + briefing) |
| `sourcesFound` | `SourceHit[]` | Unique domains extracted from `tool_result` events |
| `evidenceCount` | `number` | Count of evidence hits parsed from trace messages |
| `error` | `string \| null` | Error message if investigation failed |

**Phase detection:** walks backwards through trace events, mapping the `agent` field to phases:
- `verifier` → `"verifying"`
- `refiner` → `"refining"`
- `synthesiser` → `"synthesizing"`
- Everything else while running → `"searching"`

**Source extraction:** parses `tool_result` events and maps agent IDs to display domains (e.g., `boe_buscon_dni` → `boe.es`, `axesor_dni` → `axesor.es`).

### `InvestigationView` (`components/investigation-view.tsx`)

Right-panel orchestrator that manages three visual states:

1. **Idle** — magnifying glass icon + "Ready to Investigate" prompt
2. **Running** — `PhaseIndicator` + `SourcePills` + cancel button
3. **Complete** — `BriefingReport` + collapsible sections (sources, gaps, trace)

### `PhaseIndicator` (`components/phase-indicator.tsx`)

Animated banner showing:
- Subject name being investigated
- Phase-specific icon and label (Search/ShieldCheck/Sparkles/Brain)
- Contextual detail text (source count, evidence count, etc.)
- Indeterminate progress bar (Framer Motion animated gradient)

Hides itself when phase is `"complete"` (the briefing report takes over).

### `SourcePills` (`components/source-pills.tsx`)

Compact pill badges that appear one by one as sources are discovered:
- Color-coded by signal type (legal=red, asset=green, business=purple, employment=blue, etc.)
- Animated entrance via Framer Motion (fade + scale)
- Max 14 visible, then "+N more" overflow badge

### `BriefingReport` (`components/briefing-card.tsx`)

The final investigation report, rendered as the hero content (not wrapped in a card). Contains:
- Completion header with confidence badge
- Summary paragraph
- Findings cards with signal type and confidence badges
- Negotiation angles as highlighted quotes
- Copy-to-clipboard button (copies full briefing JSON)

### `TraceTimeline` (`components/trace-timeline.tsx`)

Compact timeline of all agent events. Designed to be embedded inside a collapsible section (not shown by default). Each event shows:
- Agent icon + label (from `config/agents.ts`)
- Event kind badge (plan/tool_call/tool_result/decision/error)
- Timestamp
- Message text

### `EvidenceList` (`components/evidence-list.tsx`)

Accordion list of all evidence items. Each item expands to show:
- Snippet text, identity match score, pairing confidence
- Matched data points
- External link to the source URL

### `GapsSection` (`components/gaps-section.tsx`)

List of investigation gaps — sources that were searched but returned no results. Shows what was tried, why nothing was found, and which sources were checked.

### `CaseForm` (`components/case-form.tsx`)

Input form with three sections:
1. **Required fields** — full name, country (always visible)
2. **Additional context** — phone, email, DNI/NIE, province, employer, etc. (collapsible)
3. **Debt context** — amount, origin, age, call attempts, outcome, legal findings (collapsible)

### `CaseSidebar` (`components/case-sidebar.tsx`)

History panel listing previous investigations. Fetches from `/api/cases` and allows clicking to load a historical case into the right panel.

---

## API Integration

The web UI communicates with the Hono API server (`src/server/index.ts`) on port 3001.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/investigate` | POST | Start an investigation. Returns SSE stream of `TraceEvent`s, then final `CaseState` |
| `/api/cases` | GET | List all completed investigations |
| `/api/cases/:id` | GET | Get a specific case with evidence, traces, and briefing |

### SSE Stream Format

The `/api/investigate` endpoint streams events as SSE:

```
data: {"ts":"...","case_id":"...","agent":"boe_buscon_dni","kind":"tool_result","message":"3 hits (high_conf=2)"}

data: {"ts":"...","case_id":"...","agent":"verifier","kind":"decision","message":"..."}

data: {"case":{},"evidence":[],"trace":[],"briefing":{}}
```

- Each `data:` line contains a JSON object
- `TraceEvent` objects are accumulated into the trace array
- The final object contains the full `CaseState` (detected by having `case`, `evidence`, and `briefing` fields)
- Error objects have an `error` field

---

## Styling & Theme

- **Dark theme** with gold/amber accent colors (Sherlock detective aesthetic)
- Tailwind CSS v4 with CSS custom properties for theming
- Signal type color coding is consistent across all components:

| Signal | Color |
|--------|-------|
| Legal | Red |
| Asset | Emerald |
| Business | Purple |
| Employment | Blue |
| Registry | Cyan |
| Subsidy | Yellow |
| Social | Pink |
| News | Orange |

---

## Key Files

| File | Purpose |
|------|---------|
| `web/src/app/page.tsx` | Root page, layout orchestration |
| `web/src/app/layout.tsx` | App shell, fonts, metadata |
| `web/src/app/globals.css` | Theme variables, dark mode |
| `web/src/hooks/use-investigation.ts` | SSE streaming + derived state |
| `web/src/components/investigation-view.tsx` | Right panel state machine |
| `web/src/components/phase-indicator.tsx` | Animated phase progress |
| `web/src/components/source-pills.tsx` | Live source discovery pills |
| `web/src/components/briefing-card.tsx` | Final report renderer |
| `web/src/components/trace-timeline.tsx` | Compact event timeline |
| `web/src/components/evidence-list.tsx` | Evidence accordion |
| `web/src/components/gaps-section.tsx` | Gap display |
| `web/src/components/case-form.tsx` | Investigation input form |
| `web/src/components/case-sidebar.tsx` | History sidebar |
| `web/src/components/sherlock-header.tsx` | App header/branding |
| `web/src/config/agents.ts` | Agent metadata (icons, labels, colors) |
| `web/src/lib/types.ts` | Zod schemas (mirrors backend types) |
| `src/server/index.ts` | Hono API server (HTTP + SSE bridge) |
