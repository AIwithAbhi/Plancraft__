# plancraft Funnel Experiments — Technical Design Document

Oct 29, 2026 · @Bhargavtz

## 1. Document control and introduction

| Field | Value |
| --- | --- |
| Document | Technical Design Document (TDD) |
| System | plancraft Funnel Experiments Prototype |
| Version | 1.0 |
| Author | Bhargav Thummar |
| Audience | Engineering, RevOps, Growth, plancraft interview panel |
| Related document | plancraft AI Funnel Experiments — Master Build Plan |

### 1.1 Purpose

This document specifies the technical design of a web prototype that runs three AI-powered acquisition and conversion experiments for plancraft, a software product for German craft businesses. It is the reference for implementation, review and testing.

### 1.2 Scope

In scope:

- **EXP-1 AI Trade Pages:** personalised landing pages for Elektriker and SHK businesses with a sample quote, a weekly planning board and an hours-saved estimate.
- **EXP-2 Excel-Umzug:** in-memory cleaning of an uploaded Excel price list, shown before signup.
- **EXP-3 Software-Berater:** a guided advisor chat, A/B tested against a static demo button.
- Shared platform: AI service, event tracking, lead capture, A/B assignment, admin dashboard.

Out of scope: real import into plancraft, user accounts and login, payment, persistent file storage, and any use of plancraft branding in public ads without written approval.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| SHK | Sanitär, Heizung, Klima (plumbing, heating, HVAC trade) |
| Angebot | A customer quote with positions, quantities and prices |
| Position / SKU | One catalog line item with a stable code |
| Visit | One anonymous browser session tied to an `anon_id` |
| Variant | The A/B arm a visit is assigned to (`control` or `chat`) |
| Golden set | Fixed test inputs used to evaluate AI output quality |
| Lead | A visitor who submitted an email with consent and a trial or demo intent |

## 2. System overview

The system is one Next.js application, pages and server logic in one codebase, hosted on Vercel in the EU without Docker or a separate backend. Three experiment routes share a single AI client, event pipeline, rate limiter and lead store.

### 2.1 Experiments summary

| ID | Name | Funnel stage | Primary metric | Success | Kill |
| --- | --- | --- | --- | --- | --- |
| EXP-1 | AI Trade Pages | Acquisition → signup | Visitor → trial/demo | ≥ 5% | < 2% |
| EXP-2 | Excel-Umzug | Consideration → signup | Uploader → trial | ≥ 15% (with ≥ 20% upload rate) | < 5% |
| EXP-3 | Software-Berater | Consideration → demo | Visitor → demo, chat vs control | ≥ 30% relative lift | Completion < 40% or no lift |

### 2.2 Goals

- G-1: Generate a trade-specific page in under 15 s (p95) from a one-line job description.
- G-2: Clean an uploaded price list of up to 5,000 rows in under 30 s (p95) without persisting the file.
- G-3: Assign and record A/B variants deterministically and stickily.
- G-4: Record every funnel step so each experiment can be evaluated against pre-registered rules.
- G-5: Keep AI cost per visitor bounded by a hard daily budget.

### 2.3 Non-goals

- No integration with plancraft's production systems or user accounts.
- No storage of uploaded files or their row content.
- No model-generated prices; all prices come from curated catalogs.
- No statistical significance claim for EXP-3 at the planned traffic of 400–500 visitors.

## 3. Requirements

Each requirement has a stable ID used in specs, tests and commit messages.

### 3.1 Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1.1 | Visitor selects a trade (Elektriker, SHK) or arrives with it preselected via URL | Must |
| FR-1.2 | Visitor enters one job line (max 140 characters) and answers two tap questions: quotes per week, team size | Must |
| FR-1.3 | System generates a sample quote using only SKUs from the trade catalog | Must |
| FR-1.4 | System generates a Mon–Fri planning board with 4–6 jobs | Must |
| FR-1.5 | System computes hours saved per week with a deterministic formula and shows its assumptions | Must |
| FR-1.6 | Generated page is stored and reachable via `/p/{slug}` | Should |
| FR-1.7 | Page shows trial and demo CTAs, tracked separately | Must |
| FR-2.1 | Visitor uploads `.xlsx`, `.xls` or `.csv` up to 4 MB and 5,000 rows | Must |
| FR-2.2 | Visitor can run the flow with a built-in sample file | Must |
| FR-2.3 | System detects header row, maps columns, normalises units and German number formats, converts gross to net, removes duplicates | Must |
| FR-2.4 | Rows that cannot be cleaned with confidence are flagged for review, not guessed | Must |
| FR-2.5 | System shows counts and a 10-row before/after preview | Must |
| FR-3.1 | Visits are assigned 50/50 to `control` or `chat`, sticky for 30 days | Must |
| FR-3.2 | Chat asks trade, team size, current tool (buttons) and one optional free-text pain question | Must |
| FR-3.3 | Plan recommendation is computed by rules; AI writes only the two-sentence explanation | Must |
| FR-3.4 | On completion, a lead summary is sent to sales via Slack or email | Must |
| FR-4.1 | All funnel events are recorded with visit, experiment, variant and UTM data | Must |
| FR-4.2 | Leads are stored only with an explicit consent timestamp | Must |
| FR-4.3 | A password-protected admin dashboard shows funnels, drop-offs and AI cost | Must |

### 3.2 Non-functional requirements

| ID | Category | Requirement |
| --- | --- | --- |
| NFR-1 | Performance | EXP-1 generation p95 < 15 s; first streamed progress event < 1.5 s |
| NFR-2 | Performance | EXP-2 processing p95 < 30 s for 5,000 rows |
| NFR-3 | Performance | Landing pages LCP < 2.5 s on 4G mobile |
| NFR-4 | Availability | Any AI failure falls back to a pre-generated example; no error page shown to visitors |
| NFR-5 | Cost | AI spend limited by `AI_DAILY_BUDGET_CENTS`; generation stops and falls back when reached |
| NFR-6 | Privacy | All data stored and processed in the EU; no file content persisted or logged |
| NFR-7 | Security | Per-IP rate limits: 5 generations/hour, 3 uploads/hour, 30 advisor calls/hour |
| NFR-8 | Quality | AI output passes schema validation 100% of the time after one retry, or falls back |
| NFR-9 | Localisation | All UI copy in German, formal Sie-form |
| NFR-10 | Accessibility | WCAG 2.1 AA for contrast, keyboard navigation and form labels |

## 4. Architecture

One Next.js application holds both the pages and the server logic. Route handlers under `app/api/v1` are the only code allowed to call the AI provider or the database, and every file in `lib/server` imports `server-only`, so it can never end up in the browser bundle. No Docker and no separate backend server: Vercel runs everything.

&#91;embedded content: system architecture · 1 frontend, 1 backend, 4 modules, 4 external services\]

Client components call the route handlers over REST, with Server-Sent Events for streamed AI progress. API keys never reach the browser.

### 4.1 Technology stack

| Layer | Technology | Version / setting |
| --- | --- | --- |
| Framework | Next.js (App Router), React, TypeScript | Next.js 15, TS strict mode |
| UI | Tailwind CSS, shadcn/ui | Design tokens in `tailwind.config.ts` |
| Server logic | Route Handlers (`app/api/v1/**/route.ts`) | Node.js runtime, `server-only` guard |
| Validation | Zod | Shared request, response and AI output schemas |
| ORM and migrations | Drizzle ORM, drizzle-kit | `@neondatabase/serverless` driver |
| Database | PostgreSQL on Neon | Region Frankfurt, branch per PR |
| Spreadsheet parsing | SheetJS (official build from cdn.sheetjs.com) | In-memory `ArrayBuffer` only |
| AI provider | `@anthropic-ai/sdk` | `claude-sonnet-5-5`, `claude-haiku-5-5` |
| Analytics and flags | PostHog (`posthog-js`, `posthog-node`) | EU cloud, cookieless until consent |
| Hosting | Vercel | Functions pinned to `fra1`, `maxDuration = 60` on AI routes |
| Bot protection | Cloudflare Turnstile | After 2 generations per visit |
| Scheduled jobs | Vercel Cron | Daily retention purge |
| Notifications | Slack incoming webhook, Resend | Lead summaries |
| Errors | Sentry (`@sentry/nextjs`) | PII scrubbing on |
| Tests | Vitest, Playwright | Unit, route handler and end-to-end |

### 4.2 Environments

| Environment | App | Database | AI budget |
| --- | --- | --- | --- |
| Local | `pnpm dev` on `localhost:3000` | Neon dev branch (no Docker) | Developer key |
| Preview | Vercel preview per PR | Neon branch per PR via the Vercel–Neon integration | €2/day |
| Production | Vercel production | Neon main branch | `AI_DAILY_BUDGET_CENTS` |

### 4.3 Repository structure

```
plancraft-experiments/
├── CLAUDE.md
├── specs/                        # feature specs, events.md, decision-rules.md
├── middleware.ts                 # A/B assignment, /admin basic auth
├── app/
│   ├── (trade)/[trade]/page.tsx
│   ├── p/[slug]/page.tsx
│   ├── excel-umzug/page.tsx
│   ├── beratung/page.tsx
│   ├── admin/page.tsx
│   └── api/v1/
│       ├── visits/route.ts
│       ├── trade-page/generate/route.ts
│       ├── trade-page/[slug]/route.ts
│       ├── excel/analyze/route.ts
│       ├── excel/sample/route.ts
│       ├── advisor/answer/route.ts
│       ├── advisor/complete/route.ts
│       ├── events/route.ts
│       ├── leads/route.ts
│       ├── admin/metrics/route.ts
│       ├── cron/purge/route.ts
│       └── health/route.ts
├── components/                   # QuoteTable, PlanningBoard, UploadDrop, AdvisorChat, ...
├── lib/
│   ├── client/                   # api.ts, track.ts, sse.ts
│   └── server/                   # every file: import 'server-only'
│       ├── llm.ts, catalog.ts, hours.ts, excel-mapper.ts
│       ├── advisor-rules.ts, notify.ts, ratelimit.ts
│       ├── schemas/              # Zod
│       ├── db/                   # Drizzle schema + client
│       ├── catalogs/             # elektriker.json, shk.json, fallback_*.json
│       └── prompts/
├── drizzle/                      # generated migrations
├── tests/                        # unit/, routes/, e2e/
├── evals/
├── vercel.json                   # cron schedule
└── .github/workflows/ci.yml
```

### 4.4 Platform constraints (Vercel)

- Every API route sets `export const runtime = 'nodejs'`; the Anthropic SDK and SheetJS need Node, not the Edge runtime.
- AI routes (`trade-page/generate`, `excel/analyze`, `advisor/complete`) set `export const maxDuration = 60`.
- Vercel functions accept request bodies up to 4.5 MB, so the upload limit is 4 MB.
- Streaming uses a `ReadableStream` returned from the route handler with `Content-Type: text/event-stream`.
- Functions are stateless with no persistent disk, which matches the no-storage design for uploads.
- The database is reached through Neon's serverless HTTP driver, so there is no connection pool to manage.

## 5. Component design

### 5.1 Frontend routes

| Route | Rendering | Experiment | Purpose |
| --- | --- | --- | --- |
| `/` | SSG | EXP-1 | Trade picker |
| `/elektriker`, `/shk` | SSG | EXP-1 | Trade landing page with job input |
| `/p/[slug]` | SSR | EXP-1 | Stored generated page (share link) |
| `/excel-umzug` | SSG | EXP-2 | Upload and result |
| `/beratung` | SSR + middleware | EXP-3 | Product page; chat or static CTA by variant |
| `/admin` | SSR, basic auth | All | Funnel dashboard |
| `/datenschutz`, `/impressum` | SSG | All | Legal pages (required in Germany) |

### 5.2 Frontend components

| Component | Responsibility | Key props / state |
| --- | --- | --- |
| `TradeHero` | Job input and two tap questions | `trade`, `onSubmit(job, quotes, team)` |
| `GenerationProgress` | Renders SSE progress steps; triggers fallback after 20 s | `stream`, `timeoutMs` |
| `QuoteTable` | Angebot layout: Pos., Beschreibung, Menge, Einheit, EP, GP, Netto, MwSt., Brutto | `quote: Quote` |
| `PlanningBoard` | Mon–Fri columns with job cards | `week: DayPlan[]` |
| `HoursSaved` | Result number and assumptions tooltip | `hoursSaved: HoursSaved` |
| `CtaBar` | Sticky trial and demo buttons, forwards UTM params | `experiment`, `visitId` |
| `UploadDrop` | Drag-and-drop with client-side type and size check | `maxBytes`, `accept` |
| `CleanPreview` | Before/after table and counters | `result: ExcelResult` |
| `AdvisorChat` | Step machine for 4 questions and result card | `variant`, `steps` |
| `LeadForm` | Email, consent checkbox, CTA type | `source`, `ctaType` |
| `ConsentBanner` | "Alle akzeptieren" and "Nur notwendige" with equal weight | PostHog opt-in |

`lib/track.ts` exposes one function, `track(name, props)`, which sends to PostHog (when consented) and always to `POST /api/v1/events`.

### 5.3 Server modules

| Module | Type | Responsibility |
| --- | --- | --- |
| `app/api/v1/trade-page/**/route.ts` | Route handler | Generate and fetch trade pages |
| `app/api/v1/excel/**/route.ts` | Route handler | Upload and sample analysis |
| `app/api/v1/advisor/**/route.ts` | Route handler | Advisor steps and completion |
| `app/api/v1/events`, `leads`, `visits` | Route handler | Event, lead and visit ingestion |
| `app/api/v1/admin/metrics/route.ts` | Route handler | Aggregated metrics for the dashboard |
| `app/api/v1/cron/purge/route.ts` | Route handler (Vercel Cron) | Retention purge, protected by `CRON_SECRET` |
| `lib/server/llm.ts` | Service | Single Claude client: retries, timeouts, token and cost accounting, budget check |
| `lib/server/catalog.ts` | Service | Load catalogs, keyword/tag pre-filter |
| `lib/server/hours.ts` | Service | Deterministic hours-saved formula |
| `lib/server/excel-mapper.ts` | Service | Parse, sample, map, clean, dedupe |
| `lib/server/advisor-rules.ts` | Service | Plan recommendation rules |
| `lib/server/notify.ts` | Service | Slack and email delivery |
| `lib/server/ratelimit.ts` | Service | Hashed-IP sliding window in Postgres |

### 5.4 Hours-saved formula

```latex
H_{week} = \frac{q \cdot m_q + t \cdot m_p}{60}
```

q = quotes per week (bucket midpoint: 3, 10, 20), m\_q = minutes saved per quote (default 25), t = team size (midpoint: 2, 7, 15), m\_p = planning minutes saved per person per week (default 15). Defaults live in config and are shown to the visitor.

### 5.5 Advisor plan rules

| Team size | Current tool | Recommendation |
| --- | --- | --- |
| 1–3 | Any | Entry plan |
| 4–10 | Excel/Papier or none | Mid plan |
| 4–10 | Other software | Mid plan, migration highlighted |
| 11+ | Any | Top plan, demo strongly suggested |

Plan names and features are filled from plancraft's public pricing page before launch; the AI may only reference features listed there.

## 6. API specification

Base path `/api/v1`. JSON over HTTPS; streamed endpoints use `text/event-stream`. Every request carries the header `X-Visit-Id`. The OpenAPI schema is generated from the Zod schemas (zod-to-openapi) at `/api/v1/openapi.json`.

### 6.1 Endpoint summary

| Method | Path | Auth | Rate limit | Description |
| --- | --- | --- | --- | --- |
| POST | `/visits` | none | 60/h | Create visit, returns `visit_id` and EXP-3 variant |
| POST | `/trade-page/generate` | none | 5/h | SSE: generate trade page |
| GET | `/trade-page/{slug}` | none | 120/h | Fetch stored page |
| POST | `/excel/analyze` | none | 3/h | Multipart upload, returns cleaning result |
| POST | `/excel/sample` | none | 10/h | Same result for the built-in sample file |
| POST | `/advisor/answer` | none | 30/h | Store one answer, return next step |
| POST | `/advisor/complete` | none | 5/h | SSE: recommendation and explanation |
| POST | `/events` | none | 600/h | Batch of up to 20 events |
| POST | `/leads` | none | 10/h | Email with consent and CTA type |
| GET | `/admin/metrics` | basic auth | none | Funnel aggregates |
| GET | `/health` | none | none | Liveness and DB check |

### 6.2 POST /trade-page/generate

```json
// Request
{
  "trade": "elektriker",
  "job_line": "Zählerschrank tauschen im EFH",
  "quotes_per_week": "6-15",
  "team_size": "4-10"
}
```

SSE events, in order: `progress` (`{"step": "positions"}`), `progress` (`{"step": "week"}`), then exactly one `result` or `fallback`.

```json
// event: result
{
  "slug": "a8f3k2",
  "quote": {
    "title": "Austausch Zählerschrank EFH",
    "items": [{"pos": 1, "sku": "EL-ZS-001", "description": "Zählerschrank 3-reihig inkl. APZ",
               "qty": 1, "unit": "Stk", "unit_price": 890.00, "line_total": 890.00}],
    "labor_hours": 9, "labor_rate": 68.00,
    "net_total": 2140.00, "vat_rate": 0.19, "vat": 406.60, "gross_total": 2546.60
  },
  "week": [{"day": "Mo", "jobs": [{"title": "Zählerschrank Fam. Weber", "crew": "Team A", "hours": 6}]}],
  "hours_saved": {"per_week": 7.5, "assumptions": {"min_per_quote": 25, "min_planning_per_person": 15}},
  "prompt_version": "trade_quote_v1"
}
```

### 6.3 POST /excel/analyze

Request: `multipart/form-data` with field `file`. Response:

```json
{
  "run_id": "x_77",
  "rows_total": 91, "rows_ready": 84, "rows_review": 7,
  "units_normalised": 38, "duplicates_merged": 5, "gross_converted": false,
  "preview": [{"before": {"Bezeichnung": "Steckd. UP reinw.", "ME": "Stck", "EP": "12,40 €"},
               "after": {"description": "Steckdose UP reinweiß", "unit": "Stk", "unit_price_net": 12.40,
                         "category": "Installationsmaterial", "needs_review": false}}],
  "duration_ms": 8400
}
```

### 6.4 POST /advisor/complete

Request: `{"session_id": "s_42"}`. SSE events: `recommendation` (`{"plan": "mid"}`), `text` chunks of the explanation, then `done`. Side effect: lead summary posted to sales when `demo_booked` or `email_captured` follows.

### 6.5 POST /leads

```json
{"email": "meister@beispiel.de", "cta_type": "demo", "source_experiment": "EXP-1",
 "consent": true, "consent_text_version": "v1"}
```

Rejected with `422` if `consent` is not `true`.

### 6.6 Error model

| HTTP | Code | When | Frontend behaviour |
| --- | --- | --- | --- |
| 400 | `invalid_input` | Job line empty or too long | Inline field message |
| 413 | `file_too_large` | Upload > 4 MB or > 5,000 rows | Message with limit |
| 415 | `unsupported_file` | Not xlsx/xls/csv, or xlsm | Message with accepted types |
| 422 | `unreadable_table` | No header row found | Offer sample file |
| 429 | `rate_limited` | Limit exceeded | Show pre-generated example |
| 503 | `budget_exhausted` | Daily AI budget reached | Show pre-generated example |
| 500 | `internal` | Unexpected error | Show pre-generated example, log with request ID |

Error body: `{"error": {"code": "file_too_large", "message": "Die Datei ist größer als 4 MB.", "request_id": "r_9f2"}}`.

## 7. Data model

Six PostgreSQL tables. Personal data exists only in `leads`; uploaded file content exists nowhere. All primary keys are UUIDv7 (time-sortable); all timestamps are `timestamptz` in UTC.

The schema is defined in TypeScript with Drizzle ORM (`lib/server/db/schema.ts`); `drizzle-kit generate` writes SQL migrations to `drizzle/` and `drizzle-kit migrate` applies them to the matching Neon branch.

### 7.1 Tables

**`visits`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | Sent as `X-Visit-Id` |
| anon\_id | text | First-party cookie value |
| experiment | text | `EXP-1`, `EXP-2`, `EXP-3` |
| variant | text, nullable | `control` / `chat` for EXP-3 |
| trade | text, nullable | From URL or picker |
| utm\_source, utm\_campaign, utm\_content | text | Ad attribution |
| ip\_hash | text | SHA-256 with rotating daily salt, for rate limiting only |
| created\_at | timestamptz |  |

**`events`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK |  |
| visit\_id | uuid FK → visits | Indexed with `name` |
| name | text | Must exist in `specs/events.md` |
| props | jsonb | No free text, no personal data |
| created\_at | timestamptz |  |

**`generated_pages`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK |  |
| slug | text unique | 6 chars, URL-safe |
| visit\_id | uuid FK |  |
| trade | text |  |
| job\_line | text | The one-line job; shown back on share page |
| output | jsonb | Validated quote, week, hours saved |
| prompt\_version | text | e.g. `trade_quote_v1` |
| latency\_ms, input\_tokens, output\_tokens, cost\_cents | int |  |
| is\_fallback | bool |  |
| created\_at | timestamptz |  |

**`excel_runs`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK |  |
| visit\_id | uuid FK |  |
| source | text | `upload` / `sample` |
| file\_ext, size\_bytes | text, int | No file name stored |
| rows\_total, rows\_ready, rows\_review, duplicates\_merged | int |  |
| status | text | `ok` or an error code |
| latency\_ms, cost\_cents | int |  |
| created\_at | timestamptz |  |

**`advisor_sessions`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK |  |
| visit\_id | uuid FK |  |
| variant | text | Always `chat` |
| answers | jsonb | `{trade, team_size, tool, pain}` |
| completed | bool |  |
| recommended\_plan | text |  |
| created\_at, completed\_at | timestamptz |  |

**`leads`**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK |  |
| visit\_id | uuid FK |  |
| source\_experiment | text |  |
| cta\_type | text | `trial` / `demo` / `email_summary` |
| email | citext | Only personal field in the system |
| consent\_at, consent\_text\_version | timestamptz, text | Required |
| created\_at | timestamptz |  |

### 7.2 Retention

| Data | Retention | Mechanism |
| --- | --- | --- |
| Uploaded files and rows | 0 (never stored) | In-memory processing only |
| `leads` | 90 days after experiment end, or handed over to plancraft with consent | Scheduled delete job |
| `pain` free text in `advisor_sessions` | 90 days | Same job |
| `visits`, `events`, `generated_pages`, `excel_runs` | 12 months, anonymous | Aggregates kept, rows purged |
| Daily IP salt | 24 hours | Rotated, old salt discarded |

## 8. AI subsystem design

The model decides only what needs language understanding: which positions fit a job, how a spreadsheet's columns map, how to phrase a recommendation. Prices, totals, hours saved and plan choice are computed in code.

### 8.1 Model usage

| Use case | Model | Output mode | Max tokens | Timeout |
| --- | --- | --- | --- | --- |
| EXP-1 quote and week | `claude-sonnet-5-5` | Tool use, strict JSON schema | 2,000 | 20 s |
| EXP-2 column mapping | `claude-sonnet-5-5` | Tool use, strict JSON schema | 1,000 | 15 s |
| EXP-3 explanation | `claude-haiku-5-5` | Streamed text, 2 sentences | 200 | 8 s |
| EXP-3 sales summary | `claude-haiku-5-5` | Tool use, JSON | 300 | 8 s |
| Eval judge | `claude-sonnet-5-5` | JSON score + reason | 400 | 30 s |

### 8.2 Request pipeline (`lib/server/llm.ts`)

1. Check daily budget; if exhausted, throw `BudgetExhausted` and the route handler returns the fallback.
2. Load the versioned prompt from `lib/server/prompts/` and render it with inputs.
3. Call the API with tool definition, temperature 0.3 (0 for mapping).
4. Parse the tool input with the Zod schema.
5. On validation failure, retry once with the validation error appended to the prompt.
6. On second failure or timeout, return the fallback and set `is_fallback = true`.
7. Record tokens, latency and cost on the result row.

### 8.3 EXP-1 generation

1. `lib/server/catalog.ts` filters the trade catalog (about 40 items) to the 15–20 most relevant by keyword and tag match.
2. The prompt lists only those SKUs and asks for SKUs, quantities, labor hours and 4–6 weekly jobs.
3. Post-processing in code: reject unknown SKUs, clamp quantities to catalog bounds, set `unit_price` to the catalog midpoint, compute line totals, net, 19% VAT and gross.

Prompt `trade_quote_v1`:

```
Du bist Kalkulator in einem deutschen {trade_label}-Betrieb.
Auftrag: "{job_line}". Teamgröße: {team_size}.
Wähle NUR Positionen aus dieser Liste (SKU-Codes): {catalog_subset}
Regeln: realistische Mengen, Arbeitsstunden separat, keine Preise erfinden,
Prüfung/Dokumentation einplanen, wenn fachlich nötig (z. B. VDE 0100-600 Prüfprotokoll).
Plane eine realistische Arbeitswoche mit diesem und 3-5 typischen weiteren Aufträgen.
Antworte ausschließlich über das Tool `build_trade_page`.
```

### 8.4 EXP-2 mapping

Input to the model: header row plus 15 sample rows, each cell truncated to 200 characters. Output: column-to-field mapping, `price_is_gross`, optional category rules. Code then applies the mapping to every row; the model never sees the full file.

### 8.5 Catalogs

One JSON file per trade with fields `sku`, `description`, `unit`, `price_min`, `price_max`, `qty_max`, `tags`. Seed items:

- **Elektriker:** Zählerschrank, FI/LS-Schalter, Unterverteilung, Wallbox 11 kW inkl. Anmeldung Netzbetreiber, Steckdosen/Schalter, NYM-J Leitung (m), Schlitze stemmen (m), PV-Anschluss, E-Check, VDE-Prüfprotokoll, Rauchmelder, Anfahrt.
- **SHK:** Gas-Brennwerttherme, Wärmepumpe Luft/Wasser, Heizkörper tauschen, Hydraulischer Abgleich, Wartung Therme, WC/Waschtisch Montage, Rohrleitung (m), Druckprobe, Spülung, Entsorgung Altgerät, Anfahrt.

Catalogs are reviewed by at least one practising electrician and one SHK owner before launch.

### 8.6 Fallbacks

For each trade, 3 pre-generated example pages are stored in `lib/server/catalogs/fallback_{trade}.json` and served whenever generation fails, times out, is rate-limited or exceeds budget. The page labels them "Beispiel" so the experience stays honest.

## 9. Experimentation and analytics

Thresholds are pre-registered in `specs/decision-rules.md` before launch and are not changed afterwards.

### 9.1 Event taxonomy

| Experiment | Events in funnel order |
| --- | --- |
| All | `page_view`, `consent_given`, `cta_click{type}`, `lead_submitted` |
| EXP-1 | `job_submitted`, `page_generated{is_fallback}`, `quote_viewed`, `share_clicked`, `generation_failed{code}` |
| EXP-2 | `upload_started`, `sample_file_used`, `upload_succeeded`, `upload_failed{code}`, `result_viewed` |
| EXP-3 | `variant_assigned{variant}`, `bubble_shown`, `chat_opened`, `q1_answered` … `q4_answered`, `result_shown`, `demo_click`, `demo_booked`, `email_captured` |

Naming: `snake_case`, past tense, properties from a fixed list. An event not in `specs/events.md` is rejected by the API with `400`.

### 9.2 A/B assignment (EXP-3)

- `middleware.ts` reads cookie `pc_exp3`; if missing, assigns by `hash(anon_id) mod 2`, sets the cookie for 30 days and calls `POST /visits` with the variant.
- The same variant is sent to PostHog as a feature flag override, so analysis and assignment can never diverge.
- Sample ratio check: if the split differs from 50/50 by more than 5 points after 200 visits, assignment is investigated before results are read.

### 9.3 Decision rules

| Experiment | Leading metric (day 2–3) | Primary metric (day 7) | Scale | Iterate | Kill |
| --- | --- | --- | --- | --- | --- |
| EXP-1 | Job submitted ÷ visitors ≥ 30% | Visitor → trial/demo | ≥ 5% | 2–5% | < 2% |
| EXP-2 | Upload or sample ÷ visitors ≥ 20% | Uploader → trial | ≥ 15% | 5–15% | < 5% |
| EXP-3 | Completion ≥ 40% of openers | Demo rate, chat vs control | Lift ≥ 30% | Directional lift | Completion < 40% or no lift |

### 9.4 Statistical limits

- EXP-1 at about 450 visitors: a measured 3.5% has a 95% interval of roughly ±1.7 points. Enough to separate 2% from 5%, not 4% from 5%.
- EXP-3: detecting 3.1% → 4% needs about 6,500–7,000 visitors per arm. At planned traffic the A/B is directional; completion rate is the decision metric.

### 9.5 Attribution

UTM parameters are stored on the visit and appended to every CTA link. In a real plancraft run, conversion is the trial-created webhook joined on `visit_id`; in the prototype it is `lead_submitted`. Each experiment and trade runs as a separate ad campaign so cost per visitor is clean.

### 9.6 Admin dashboard

SQL views over `events` power `/admin`: funnel per experiment, EXP-1 by trade and prompt version, EXP-2 failures by code and median time to result, EXP-3 per-question drop-off by variant, and AI cost per generated page. Ad spend is entered manually per campaign.

## 10. Security, privacy and GDPR

Privacy is a conversion feature for this audience: every claim on the page must be technically true and verifiable in this design.

### 10.1 Threats and controls

| Threat | Control |
| --- | --- |
| AI cost abuse (scripted generation) | Hashed-IP rate limits, daily budget cap, Cloudflare Turnstile after 2 generations |
| Malicious spreadsheet (zip bomb, macros, formula injection) | 4 MB and 5,000-row limits checked before parsing, `.xlsm` rejected, SheetJS read with `cellFormula: false`, cells starting with `=`, `+`, `-`, `@` treated as text |
| Prompt injection via job line or cells | Inputs placed in delimited data blocks, tool-only output, Zod validation, SKU allow-list |
| Leaked secrets | Keys only in Vercel environment variables without the `NEXT_PUBLIC_` prefix; `server-only` import guard on `lib/server`; secret scanning in CI |
| Admin exposure | Basic auth in `middleware.ts` over HTTPS, separate strong password, `noindex` |
| Data leakage through logs | No request bodies logged; `/excel` routes log only counts and error codes |
| XSS through generated text | React escaping, no `dangerouslySetInnerHTML`, strict CSP in `next.config.ts` headers |
| CSRF on lead form | SameSite=Lax cookies, origin check in the route handler |
| Unauthorised cron calls | `CRON_SECRET` bearer check on `/api/v1/cron/purge` |

### 10.2 GDPR measures

- All processing in EU regions: Vercel functions pinned to `fra1`, Neon Frankfurt, PostHog EU.
- Data processing agreements with each processor, including the AI provider; AI processing listed in the privacy policy.
- Legal basis: consent for leads and analytics cookies; legitimate interest for anonymous, cookieless measurement and security.
- Data minimisation: only email in `leads`; IP stored only as a salted daily hash; file content never stored.
- Consent banner with equal-weight "Nur notwendige" option; consent text versioned and stored with each lead.
- `Impressum` and `Datenschutzerklärung` linked in every footer, as German law requires.
- Deletion on request by email lookup in `leads`; scheduled purge per section 7.2 via Vercel Cron.

### 10.3 Page copy that must match the implementation

| Page claim | Backed by |
| --- | --- |
| "Wir speichern Ihre Datei nicht." | File read into an `ArrayBuffer` inside the route handler, no disk write, no body logging, `excel_runs` holds counts only |
| "Zur Analyse werden Beispielzeilen an unseren KI-Dienstleister übertragen." | Only header + 15 rows sent, per section 8.4 |
| "Server in Deutschland" | Vercel functions in `fra1` (Frankfurt), Neon Frankfurt |
| "Beispielangebot" | Prices from catalog midpoints, not quotes from plancraft |

### 10.4 Branding

The prototype runs under a neutral label. plancraft's name, logo or domain are used in public traffic only after written approval from plancraft.

## 11. Testing, development process and operations

### 11.1 Test strategy

| Level | Tool | Scope | Gate |
| --- | --- | --- | --- |
| Unit | Vitest | Hours formula, plan rules, unit and number normalisation, totals, Zod schemas | Every PR |
| Route handlers | Vitest, calling the exported `GET`/`POST` functions with `Request` objects | Every endpoint, every error code in 6.6, rate limits | Every PR |
| End-to-end | Playwright | Three happy paths and fallback path, desktop and 390 px mobile | Every PR, against preview URL |
| AI code graders | `evals/` harness run with `tsx` | Schema valid, only catalog SKUs, totals correct, German output, Excel row counts | Every PR; must be 100% |
| AI model graders | Claude as judge, rubric 1–5 | Quote realism, week plausibility, no invented features | Nightly and on prompt change; mean ≥ 4.5 |
| Load | k6 against the preview URL | 20 concurrent generations, 5 concurrent uploads | Before launch |
| User test | 5 craftsmen, screen share | Comprehension and trust of each page | Before ads start |

Golden set: 30 job lines per trade, 15 messy spreadsheets (merged cells, cp1252, gross prices, duplicates, empty rows), 20 advisor answer combinations.

### 11.2 Development process (loop engineering)

Three nested loops, run with Claude Code as the implementing agent and the developer as reviewer.

1. **Build loop (per feature):** spec in `specs/<feature>.md` with acceptance checks → agent proposes a file-level plan → failing tests written from the checks → agent implements and runs `pnpm check` until green (cap 5 iterations; persistent failure means the spec is fixed) → human diff review → PR with preview deploy.
2. **AI quality loop (per prompt):** change one thing, bump prompt version, run `pnpm evals`, keep only if scores improve without regressions; stop at 100% code-grader pass and ≥ 4.5 judge mean.
3. **Growth loop (after launch):** daily review of the largest drop-off, one hypothesis, one flagged change, result logged in `specs/changelog.md`.

Independent features run in parallel git worktrees; shared modules (`llm.ts`, `track.ts`) merge to `main` first.

`CLAUDE.md` at the repo root:

```markdown
# Project: plancraft funnel experiments (prototype)

## Stack
- One Next.js 15 app (App Router, TypeScript strict). No Docker, no separate backend.
- Server code lives in app/api/v1/**/route.ts and lib/server/**. Database: Neon + Drizzle.

## Rules
- Read the matching file in specs/ before touching code. The spec wins.
- Run `pnpm check` after every change. Never mark a task done while it fails.
- All UI copy in German, Sie-form. Code, comments, commits in English.
- Every file in lib/server starts with `import 'server-only'`.
- Every API route sets `export const runtime = 'nodejs'`.
- AI output must pass the Zod schema in lib/server/schemas. Never trust raw model JSON.
- Prices come from lib/server/catalogs only. The model never sets a price.
- Never log request bodies on /excel routes. Never write uploads anywhere.
- No new dependencies without saying why in the PR description.
- Every user action that matters calls track() with an event from specs/events.md.
- Reference requirement IDs (FR-x.y, NFR-x) in commit messages.

## Commands
- pnpm dev          # app on :3000 against the Neon dev branch
- pnpm check        # eslint, tsc --noEmit, vitest, playwright, code-grader evals
- pnpm evals        # full AI quality suite including model graders
- pnpm db:generate  # drizzle-kit generate
- pnpm db:migrate   # drizzle-kit migrate
```

### 11.3 CI/CD

1. On PR (GitHub Actions): eslint, `tsc --noEmit`, Vitest, code-grader evals, secret scan.
2. Preview: Vercel builds a preview deployment; the Vercel–Neon integration creates a database branch; `drizzle-kit migrate` runs on it; Playwright runs against the preview URL.
3. On merge to `main`: `drizzle-kit migrate` on the Neon main branch, Vercel production deploy, smoke test on `/api/v1/health`.
4. Nightly (GitHub Actions schedule): model-grader evals and a cost report. Daily (Vercel Cron in `vercel.json`): retention purge.

### 11.4 Configuration

| Variable | Scope | Example | Purpose |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | server | secret | AI provider |
| `DATABASE_URL` | server | secret | Neon connection (set per branch by the integration) |
| `AI_DAILY_BUDGET_CENTS` | server | `800` | Hard daily AI cap |
| `RATE_LIMIT_GENERATE_PER_HOUR` | server | `5` | NFR-7 |
| `HOURS_MIN_PER_QUOTE` | server | `25` | Formula default |
| `HOURS_MIN_PLANNING_PER_PERSON` | server | `15` | Formula default |
| `SLACK_WEBHOOK_URL` | server | secret | Lead summaries |
| `RESEND_API_KEY` | server | secret | Email summaries |
| `ADMIN_PASSWORD` | server | secret | `/admin` basic auth in middleware |
| `CRON_SECRET` | server | secret | Protects the cron route |
| `TURNSTILE_SECRET_KEY` | server | secret | Bot check verification |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | client | public | Bot check widget |
| `NEXT_PUBLIC_POSTHOG_KEY` | client | public | Analytics |

The API is served from the same origin as the pages, so no API base URL or CORS setup is needed.

### 11.5 Observability

- Structured JSON logs with `request_id`, `visit_id`, route, latency, status; never request bodies.
- Sentry for client and server errors, with PII scrubbing on.
- Alerts: fallback rate > 10% over 1 hour, p95 generation > 15 s, AI spend > 80% of daily budget, any 5xx spike.

## 12. Risks, open questions and delivery plan

### 12.1 Risks

| ID | Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- | --- |
| R-1 | plancraft's product fits electricians poorly (VDE documentation, material catalogs), so leads churn | High | Medium | Ask for electrician retention data before scaling EXP-1 |
| R-2 | Generated quotes look unrealistic to a Meister | High | Medium | Catalog-only SKUs, code-set prices, expert review, judge evals |
| R-3 | Visitors refuse to upload business files | Medium | High | Sample-file path, exact privacy copy, in-memory design |
| R-4 | Chat adds friction and lowers demo rate | Medium | High | Predicted; 4 tap questions, kill on completion < 40% |
| R-5 | Traffic too low for clear results | Medium | Medium | Pre-registered bands, leading metrics, stated statistical limits |
| R-6 | AI cost or abuse spike | Low | Low | Budget cap, rate limits, Turnstile, fallbacks |
| R-7 | Running ads with plancraft branding without approval | High | Low | Neutral label; ads only after written approval |

### 12.2 Open questions for plancraft

- [ ] Do you have electrician or SHK customers today, and how do they retain compared with roofers?
- [ ] What does the roofer trade page convert at, visitor → trial?
- [ ] Which fields does your Excel import accept, and what share of trials use it in week one?
- [ ] What is the current demo booking rate on the pricing page?
- [ ] Can trial-created events be shared via webhook for attribution?

### 12.3 Delivery plan

| Day | Deliverable | Acceptance |
| --- | --- | --- |
| 1 | Next.js repo, `CLAUDE.md`, specs, decision rules, `llm.ts`, `track.ts`, Drizzle schema and migrations, Vercel + Neon linked | Event from live URL lands in Postgres |
| 2 | EXP-1 server side: catalogs, generation route, Zod validation, hours formula, evals | Code graders 100%, judge ≥ 4.5 for both trades |
| 3 | EXP-1 pages: hero, progress, quote, planning board, CTA, share page | Playwright passes at 390 px |
| 4 | EXP-2: SheetJS parser, mapping prompt, cleaning, preview, sample file | 15 golden files parse; p95 < 30 s |
| 5 | EXP-3: middleware, advisor flow, rules, sales summary | Both variants reachable; summary posts to Slack |
| 6 | Admin dashboard, consent, rate limits, budget cap, fallbacks, cron purge, 5 user tests | No visitor-facing error on any failure path |
| 7 | Write-up per experiment, demo script, backup recording | Full live demo in 8 minutes |

### 12.4 Prototype vs production

| Prototype | Production (plancraft run) |
| --- | --- |
| `lead_submitted` as conversion | Trial-created webhook joined on `visit_id` |
| No import | Import API or CSV in plancraft's format |
| Neutral branding | plancraft brand and domain, with approval |
| Manual ad-spend entry | Ad platform cost import |
