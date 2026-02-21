# Changelog

All notable changes to this project will be documented in this file.

## [1.23.0] - 2026-02-21

### Title

v1.23.0 - Auth Identity Endpoint

### Added

- `GET /auth/me` (requires Bearer token) — returns `{ id, email }` from JWT without DB access.
  Enables userId resolution in operational smoke tests and unblocks the billing checkout flow (PR-K).

### Quality

- 2 new tests in `apps/api/src/auth.test.js` covering 401 (no token) and 200 (valid token) cases.
- Full suite green: **149/149**.

## [1.22.0] - 2026-02-21

### Title

v1.22.0 - Stripe Webhooks (Subscription Lifecycle)

### Highlights

- Adds a Stripe webhook ingestion endpoint with hardened signature verification.
- Enables subscription lifecycle updates from Stripe events into the internal billing model.
- Keeps billing core provider-agnostic: lifecycle state comes from webhook payload processing.

### Added

- Stripe webhook route:
  - `POST /billing/webhooks/stripe` registered before `express.json()` to preserve raw body
- Stripe webhook service:
  - Event dispatcher for:
    - `checkout.session.completed`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_failed`
- Test helper:
  - `generateStripeSignature(payload, secret)` in `apps/api/src/test-helpers.js`
- Integration tests:
  - `apps/api/src/stripe-webhooks.test.js` with 12 scenarios

### Changed

- Signature verification hardening:
  - Compare HMAC signatures as hex bytes (not UTF-8 strings)
  - Sign the raw request `Buffer` directly
  - Support multiple `v1=` entries in `Stripe-Signature`
  - Validate hex format before `timingSafeEqual`
  - Guard malformed/expired timestamp with finite check + 300s tolerance
- Webhook handler returns deterministic error responses for missing/malformed signatures.

### Quality

- Full API suite green after webhook addition (`147/147`).
- Full monorepo gates green:
  - `npm run lint`
  - `npm run test`
  - `npm run build`

### Impact

- From: "subscriptions updated only by internal flows."
- To: "Stripe event lifecycle is ingested and reconciled in near real time."

## [1.21.0] - 2026-02-21

### Title

v1.21.0 - Billing Entitlements Foundation (Provider-Agnostic)

### Highlights

- Adds a billing foundation with plan features and subscription lifecycle states.
- Introduces entitlement middleware for premium gates and numeric caps.
- Enforces feature access for import/export and analytics trend history.

### Added

- Billing data model:
  - `plans` table with JSONB feature entitlements (`free`, `pro`)
  - `subscriptions` table with partial unique index enforcing one active/trialing/past_due subscription per user
- Billing service:
  - `getActivePlanFeaturesForUser()` with lazy fallback to free plan
  - `getSubscriptionSummaryForUser()` for subscription payload shaping
- Billing endpoint:
  - `GET /billing/subscription` (authenticated)
- Entitlement middleware:
  - `requireFeature(feature)` returns `402` + `Recurso disponivel apenas no plano Pro.`
  - `attachEntitlements` exposes `req.entitlements` for numeric caps

### Changed

- Premium feature gates:
  - CSV import (`/transactions/import/dry-run`, `/transactions/import/commit`) requires `csv_import`
  - CSV export (`/transactions/export.csv`) requires `csv_export`
  - Analytics trend (`/analytics/trend`) capped by `analytics_months_max`
    - free default is capped to 3 months
    - explicit requests above cap return `402` + `Limite de historico excedido no plano gratuito.`
- Integration tests now promote users to `pro` where premium flows are intentionally validated.

### Quality

- Added `apps/api/src/billing.test.js` with end-to-end entitlement scenarios.
- Full API suite green after changes (`135/135`).
- Full monorepo gates green:
  - `npm run lint`
  - `npm run test`
  - `npm run build`

### Impact

- From: "single-plan behavior with no enforcement."
- To: "plan-aware feature access with explicit gates and upgrade path."

## [1.19.0] - 2026-02-21

### Title

v1.19.0 - Scroll-to-Summary Drilldown + Trend Delta Tooltip

### Highlights

- Trend month click now auto-scrolls to the monthly summary section after month sync.
- Trend tooltip now includes month-over-month deltas for income, expense, and balance.
- Scroll behavior remains guarded by valid month input, and delta sorting contract is documented.

### Added

- Dashboard drilldown scroll (Web):
  - `summarySectionRef` attached to the "Resumo mensal" section
  - `handleTrendMonthClick` now calls `scrollIntoView({ behavior: "smooth", block: "start" })` after valid month selection
- Trend tooltip delta details (Web):
  - `buildDeltaMap` computes month-over-month deltas for income/expense/balance
  - Tooltip displays absolute value plus directional delta text
  - First month intentionally omits delta text (no previous baseline)
- Developer contract note:
  - `TrendChart` now documents that points must be sorted ascending by month (API contract)

### Changed

- Month click in `TrendChart` now both updates dashboard month state and focuses the summary section.
- Chart click affordance uses class-based pointer styling when navigation is enabled.

### Quality

- Extended `App.test.jsx` with scroll-to-summary assertion (`scrollIntoView` call on month click).
- Full monorepo validation green:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- CI checks green for PR #139 (`api`, `web`, `Vercel`).

### Impact

- From: "Month click updates context only."
- To: "Month click updates context and moves focus to the summary users need next."

## [1.18.0] - 2026-02-21

### Title

v1.18.0 — Deep-linked Month Navigation + Trend UX Polish

### Highlights

- The selected month in the dashboard is now persistent: shareable via URL, refresh-safe, and Back/Forward-aware.
- The trend chart speaks the user's language: pt-BR labels, a visible marker on the active month, and an explicit click affordance.

### Added

- URL persistence for `selectedSummaryMonth` (Web):
  - `?summaryMonth=YYYY-MM` read on init via `getInitialSummaryMonth()`; invalid values fall back to current month
  - Existing URL-sync `useEffect` extended: writes `summaryMonth` alongside all filter/pagination params
  - `popstate` listener syncs state on browser Back/Forward
- TrendChart UX polish (Web):
  - `formatMonthLabel`: converts `YYYY-MM` to `Fev/26` style (pt-BR static array, no `Intl` / locale risk)
  - `XAxis tickFormatter` and `CustomTooltip` header both use `formatMonthLabel`
  - `selectedMonth?: string` prop: `ReferenceLine` (brand purple, dashed) marks the active month when it falls within the trend data range
  - Click affordance: heading appends `— clique em um mes para navegar` hint when `onMonthClick` is wired

### Changed

- Dashboard month selection now persists in URL and survives refresh, deep-link, and browser navigation.
- Trend chart axis labels changed from raw `YYYY-MM` to `Mmm/YY` (pt-BR).

### Quality

- 6 new tests in `App.test.jsx`:
  - Initializes `selectedSummaryMonth` from valid `?summaryMonth` in URL
  - Ignores invalid `?summaryMonth` and falls back to current month
  - Month click updates `summaryMonth` in URL
  - Other query params preserved when updating `summaryMonth`
  - `selectedMonth` prop passed to TrendChart from URL init
  - `selectedMonth` prop reflects new month after chart click
- Web gates green (`typecheck`, `lint`, `test` 100/100, `build`)
- CI green across `api`, `web`, `Vercel` for both PRs (#136, #137)

### Impact

- From: "Click a month, lose it on refresh."
- To: "Click a month, share the link, come back tomorrow — same context."

## [1.17.0] - 2026-02-21

### Title

v1.17.0 — Historical Trend Chart: 6-Month Evolution + Month Click Sync

### Highlights

- Adds historical context directly into the dashboard with a 6-month trend chart (income / expense / balance).
- Turns the trend chart into navigation: clicking a month syncs the whole dashboard (summary, MoM compare, budgets).

### Added

- Historical trend chart (Web):
  - `GET /analytics/trend?months=6` consumption via a new typed service (`analytics.service.ts`)
  - Lazy-loaded `TrendChart` component using Recharts (3 series: income, expense, balance; custom tooltip; empty state)
  - Dashboard section: **Evolucao (ultimos 6 meses)**
  - Loading skeleton + error fallback states
- Interactive month drilldown (Web):
  - Clicking a month in the trend chart updates `selectedSummaryMonth`
  - Automatically reloads summary, MoM compare, and budgets in sync
  - Guard against malformed month strings (`MONTH_VALUE_REGEX`)

### Changed

- Dashboard now connects historical view with monthly insights through a single interaction (chart click).
- Trend loading flow added with explicit loading and error states.

### Quality

- Extended `App.test.jsx` coverage:
  - trend render when API returns data
  - error fallback when trend request fails
  - loading state for pending promise
  - confirms `getMonthlyTrend` called with `months=6`
  - month click triggers synchronized reload of summary / compare / budgets
  - sequential month clicks trigger sequential synchronized reloads
- Web gates green (`typecheck`, `lint`, `test` 94/94, `build`)
- `TrendChart` ships as a separate lazy chunk (12.71 kB)

### Impact

- From: "Static dashboard sections."
- To: "A dashboard that lets you drill down month-by-month from the trend itself."

## [1.16.0] - 2026-02-21

### Title

v1.16.0 - Product Insights: MoM Compare, Proactive Budget Alerts, and Category Movers

### Highlights

- This release transforms Control Finance from a transaction recorder into a product that actively surfaces insights and drives user action.
- Month-over-Month (MoM) comparison powered by a single API contract (`compare=prev`).
- Proactive in-app budget alert when a category reaches near limit (>=80%).
- Top Category Movers section showing the most impactful spending changes.

### Added

- MoM compare as a single source of truth:
  - `GET /transactions/summary?month=YYYY-MM&compare=prev`
  - backend-driven delta calculation (`current`, `previous`, `delta`, `byCategoryDelta`)
  - frontend MoM cards consume absolute delta, percentage delta (with `null` fallback), and correct tone semantics
  - centralized month-over-month logic in API.
- Proactive budget alert (Web):
  - dashboard banner triggered when at least one budget is in `near_limit` status
  - banner focuses on the highest `near_limit` percentage for urgency
  - no additional infra (UI-only, no email dependency)
  - existing Budget Alert Center preserved (`near_limit` + `exceeded`).
- Top Category Movers (Web):
  - new dashboard section: `Top variacoes por categoria`
  - uses `byCategoryDelta` from MoM compare
  - top 3 categories ordered by `abs(delta)`
  - directional badges (`↑/↓/→`) with percentage and absolute currency delta
  - CTA per category applies filter + selected month range and scrolls to transactions list
  - graceful empty fallback when no variation exists.

### Changed

- Dashboard MoM flow migrated from dual summary calls to a single `compare=prev` call.
- Frontend delta math removed in favor of API-calculated compare contract.
- Improved consistency between summary cards and category-level insights.

### Quality

- Extended `App.test.jsx` coverage:
  - MoM render and fallback scenarios
  - `previous=0` percentage edge case
  - proactive near-limit banner visibility
  - category movers ordering (top 3 by absolute delta)
  - CTA applying category + month range filter.
- Full monorepo validation:
  - `lint`
  - `typecheck`
  - `test`
  - `build`
- PR checks green (`api` / `web` / `vercel`).

### Impact

- From: "Here are your transactions."
- To: "Here is what changed, where it changed, and what you should act on."

## [1.15.0] - 2026-02-21

### Highlights

- Dashboard now provides month-over-month (MoM) insight for Income, Expense and Balance.
- Budget Alert Center introduces actionable risk visibility for near-limit and exceeded budgets.
- API now exposes monthly financial trend analytics with zero-filled month series.

### Added

- Web: MoM indicators on monthly summary cards (direction, percentage delta and absolute delta).
- Web: Expense-aware MoM semantics (`expense` up is treated as negative signal).
- Web: Budget Alert Center ordered by severity (`exceeded` first), with direct CTAs:
  - `View transactions`: applies category + selected month filters and scrolls to the list.
  - `Adjust budget`: opens the budget edit modal.
- API: authenticated endpoint `GET /analytics/trend?months=...` returning monthly:
  - `month` (`YYYY-MM`)
  - `income`
  - `expense`
  - `balance`

### Changed

- API: `months` query param is validated with:
  - default `6`
  - allowed range `1..24`
  - `400` for invalid values
- API: trend aggregation excludes soft-deleted transactions (`deleted_at IS NULL`).
- API: transaction type values were centralized into shared constants for service consistency.

### Quality

- API contract tests added for `/analytics/trend` covering:
  - `401` without token
  - `400` invalid `months` inputs
  - default 6-month zero-filled series
  - mixed-month aggregation with empty months
  - soft-deleted transaction exclusion
- Web tests expanded for:
  - MoM rendering, fallback and edge cases
  - Budget Alert Center ordering and CTA behaviors
- Test infrastructure compatibility:
  - analytics service includes a `pg-mem` fallback path for monthly trend tests without changing API contract.

## [1.14.0] - 2026-02-21

### Added

- Web core pages migrated to TypeScript:
  - `App.tsx`
  - `Login.tsx`
  - `CategoriesSettings.tsx`
- Observability operational assets:
  - Grafana Alloy worker config for authenticated `/metrics` scrape and remote_write
  - baseline dashboard and alert rules
  - warmup traffic script for metrics ingestion
  - observability validation order guide
- Availability SLI/SLO baseline documentation and runbook integration.

### Changed

- CI now enforces full Web typecheck in pull requests.
- API write endpoints now apply per-user rate limiting.
- Alloy config now uses inline static targets in `prometheus.scrape` (removing unsupported `discovery.static` usage).

### Security

- `/metrics` remains protected in production with `Authorization: Bearer <METRICS_AUTH_TOKEN>`.
- Added `ops/alloy/.env.example` with safe placeholders for Render Worker configuration.

### Quality

- Production observability ingestion validated in Grafana Cloud (`http_requests_total` rate > 0).
- CI checks remained green across API/Web/Vercel for release-line pull requests.

### Scope

- Release focused on type safety, observability operability, and runtime hardening.

## [1.13.1] - 2026-02-20

### Added

- CSV export now includes `category_name` (`id,type,value,date,description,notes,category_name,created_at`).
- Export category labels with fallbacks:
  - `Sem categoria` for null category.
  - `Categoria nao encontrada` when category id is unresolved.

### Changed

- Release runbook updated with incident severity and escalation criteria (`P1/P2/P3`).
- Release runbook now includes `APP_BUILD_TIMESTAMP` in deploy verification checks.

### Ops

- Production `buildTimestamp` in `/health` configured and validated.
- Post-release check now enforces `/health.commit == origin/main`.

## [1.13.0] - 2026-02-20

### Added

- End-to-end request correlation via `x-request-id` (Web -> API).
- Structured JSON logging for HTTP lifecycle, errors and startup events.
- Prometheus metrics endpoint (`GET /metrics`) with:
  - HTTP request counter
  - Latency histogram
  - Bearer token protection in production.
- Expanded `GET /health` with:
  - `buildTimestamp`
  - `uptimeSeconds`
  - `db.status`
  - `db.latencyMs`
  - `requestId`
- Safe ISO timestamp validation with fallback to `"unknown"`.

### Behavior

- `/health` returns `200` when DB is healthy.
- `/health` returns `503` when DB fails (`ok: false`).
- `/metrics` requires `Authorization: Bearer <METRICS_AUTH_TOKEN>` in production.

### Scope

- Observability-only. No business or domain behavior changes.

### Technical

- Merge commit: `cf6936cf6674bacbef1bc2bd316575c13f35e554`
- PR: #109

## [1.12.0] - 2026-02-20

### Added

- Categories v2 (soft delete, restore, `normalized_name`, partial unique index).
- Categories management UI.
- Backfill tooling (`db:backfill:categories-normalized`).
- Automated smoke validation script (`scripts/smoke-categories-v2.ps1`).
- Operational Maturity section in README.
- Release runbook documentation.

### Changed

- `PATCH /transactions/:id` now supports updating `category_id`.
- Allows `category_id = null` (Uncategorized).
- Enforces active-category and ownership validation on update.

### Fixed

- Resolved inconsistency where Web reset category to "Uncategorized" but backend ignored `category_id` in PATCH.

### Integrity

- Domain guards for deleted categories and restore conflicts.
- Expanded contract test coverage.

### Ops

- Runtime `/health` exposes version and commit.
- CI governance enforced before merge to `main`.

## [1.11.0] - 2026-02-19

### Highlights

- Monthly budgets by category for budget vs actual tracking in the selected month.
- Budget status signals (`ok`, `near_limit`, `exceeded`) with progress visualization.
- Full Web management flow for monthly budgets (create, edit, delete).

### API

- Added monthly budgets domain:
  - `POST /budgets` for upsert by `user_id + category_id + month`
  - `GET /budgets?month=YYYY-MM` for consolidated budget view per category
  - `DELETE /budgets/:id` for user-scoped delete with ownership enforcement
- Added persistence:
  - New `monthly_budgets` table
  - Unique index on `(user_id, category_id, month)`
  - Index on `(user_id, month)`
- `GET /budgets` consolidation includes:
  - `actual` from `transactions` with `type = 'Saida'`, monthly range, `deleted_at IS NULL`
  - computed `remaining`, `percentage`, and `status`
- Status rules:
  - `ok` when usage is `< 80%`
  - `near_limit` when usage is `>= 80%` and `<= 100%`
  - `exceeded` when usage is `> 100%`

### Web

- Added "Metas do mes" block to dashboard:
  - fetches budgets by selected summary month
  - loading, empty, error, and retry states
  - per-category card with budget, actual, remaining, usage percentage, status badge, and progress bar
- Added budgets CRUD UX:
  - `+ Nova meta` action
  - edit and delete actions per budget card
  - inline modal for create/edit with validation and success feedback
- Added UX and accessibility improvements:
  - applied filter chips summary and removable chips
  - icon-only remove control with preserved aria-label and 32x32 hit area
  - search `Escape` behavior for draft clear and applied query removal
  - polish for empty state CTA and edit mode clarity

### Quality

- Expanded API contract tests for budgets:
  - upsert
  - aggregation and status calculation
  - ownership-safe delete
- Expanded Web tests for:
  - budgets block rendering and error retry
  - budgets create and delete flows
  - applied filters summary and chip removal
  - search `Escape` behavior
  - budgets polish flows (empty state CTA and edit-mode messaging)
- CI green across `lint`, `test`, and `build`.

### Release Integrity

- Main aligned at `86f97054c8f48862d5cd9dbf2736f70dcf5d6900`.
- Release train delivered with additive endpoints and no breaking API changes.

## [1.10.4] - 2026-02-19

### Highlights

#### Web

- Pagination migrated to an offset-first model
- Pagination state persisted in querystring:
  - `limit`
  - `offset`
  - `type`
  - `categoryId`
  - `period`
  - `from`
  - `to`
- Predictable navigation controls:
  - First
  - Previous
  - Next
  - Last
- Shareable and refresh-safe dashboard URLs

#### API

- `GET /transactions` exposes `meta.offset`
- `offset` takes precedence over `page` when both are provided
- Backward-compatible response shape:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "offset": 0,
    "total": 45,
    "totalPages": 3
  }
}
```

#### UX improvements

- Range display based on `meta.offset`
- Automatic clamp of extreme offsets
- Pagination reset when filters or page size change

#### Quality

- Updated unit tests (API + Web)
- Full CI green (`lint`, `test`, `build`)
- No breaking changes
