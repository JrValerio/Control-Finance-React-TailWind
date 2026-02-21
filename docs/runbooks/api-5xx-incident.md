# API 5xx Incident Runbook

## Scope
Operational response for `5xx` alerts from:
- `ControlFinanceApi5xxRateHigh`
- `ControlFinanceApi5xxPercentHigh`
- `ControlFinanceTransactionsP95High` (when accompanied by errors)

## Alert Thresholds
- `P1`: 5xx rate > `0.2 req/s` for 5 minutes
- `P2`: 5xx ratio > `2%` for 5 minutes
- `P2`: p95 `/transactions` > `500ms` for 10 minutes

## First 15 Minutes
1. Confirm alert still firing in Grafana Alerting.
2. Capture timestamp, rule name, and affected endpoint(s).
3. Check API logs for:
   - status `500-599`
   - endpoint distribution (`/auth`, `/transactions`, `/transactions/import/*`, `/budgets`)
   - recurring error message signature
4. Validate health:
   - `GET /health` status and `db.status`
5. Validate metrics:
   - `sum(rate(http_requests_total{job="control-finance-api", status="5xx"}[5m]))`
   - `(sum(rate(http_requests_total{job="control-finance-api", status="5xx"}[5m])) / clamp_min(sum(rate(http_requests_total{job="control-finance-api"}[5m])), 0.001))`
   - `histogram_quantile(0.95, sum by (le) (rate(http_request_latency_ms_bucket{job="control-finance-api", endpoint="/transactions"}[5m])))`

## Triage Decision
- If impact is broad (auth or transaction writes failing): classify `P1`.
- If impact is localized with workaround: classify `P2`.
- If alert clears quickly and impact is low: classify `P3` and keep monitoring.

## Mitigation Path
1. If config-related: rollback env/config change first.
2. If release-related and sustained user impact:
   - rollback API to last stable commit in Render
   - verify `GET /health` and `/metrics`
3. Keep monitor window active for 30 minutes after mitigation.

## Closure Criteria
- Alert resolved and remains clear for 30 minutes.
- `/health` stable (`200`, `db.status=ok`).
- 5xx rate back to baseline.
- Incident notes recorded in release/runbook evidence.

## Evidence Template
```md
Incident Start (UTC):
Severity (P1/P2/P3):
Alert Rule:
Impact Scope:
Root Cause:
Mitigation:
Rollback: yes/no
Recovery Time:
Owner:
```
