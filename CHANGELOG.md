# Changelog

All notable changes to this project will be documented in this file.

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
