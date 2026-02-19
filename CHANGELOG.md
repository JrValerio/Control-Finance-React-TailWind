# Changelog

All notable changes to this project will be documented in this file.

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
