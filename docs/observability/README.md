# Observability: Operational Validation Order (Grafana Cloud + Alloy)

This folder versions the baseline observability assets for Control Finance:
- Grafana Alloy worker config (in `ops/alloy/`)
- Dashboard JSON (in `docs/observability/dashboards/`)
- Alert rules YAML (in `docs/observability/alerts/`)
- Setup guide (in `docs/observability/grafana-cloud.md`)

## Golden Validation Order (do not skip)

### 1) Worker Logs (Render Alloy)
Goal: confirm scrape auth + remote_write are healthy before checking Grafana UI.

Checklist:
- Alloy Worker is deployed and running.
- No repeated `401/403` errors scraping `/metrics`.
- No repeated `remote_write` failures.

Common failure modes:
- Wrong `METRICS_AUTH_TOKEN` => 401/403
- Wrong remote_write URL/credentials => remote_write errors
- `API_HOST` wrong => DNS/connect errors

### 2) Grafana Explore (Ingestion Proof)
Goal: prove data is landing in Grafana Cloud.

Run in Explore (Prometheus datasource):
- `sum(rate(http_requests_total{job="control-finance-api"}[5m]))`

Expected:
- A value > 0 once the API receives traffic.

If you see "No data":
- Confirm Worker logs first.
- Generate traffic on API (hit `/health` and a couple auth-protected endpoints).
- Wait 1-3 minutes depending on scrape interval.

### 3) Import Dashboard JSON
Goal: visualization only after ingestion is confirmed.

Asset:
- `docs/observability/dashboards/control-finance-api-min.json`

Notes:
- Ensure datasource is mapped during import (Prometheus / Grafana Cloud Metrics).
- Panels should show fresh samples (check time range: last 6h).

### 4) Apply Alert Rules YAML
Goal: only apply alerts after metrics are visible to avoid confusion.

Asset:
- `docs/observability/alerts/control-finance-api-alerts.yaml`

After applying:
- Verify rule evaluation status (no parse errors).
- Confirm the queries match the metric contract:
  - `http_requests_total{status="5xx"}`
  - `http_request_latency_ms_bucket{endpoint="/transactions"}` + `histogram_quantile`

## References
- Grafana Cloud setup: `docs/observability/grafana-cloud.md`
- Release checklist: `docs/runbooks/release-production-checklist.md`
- Alloy worker: `ops/alloy/README.md`
- Dashboard: `docs/observability/dashboards/control-finance-api-min.json`
- Alerts: `docs/observability/alerts/control-finance-api-alerts.yaml`
