# Grafana Cloud Metrics Setup

This guide describes how to connect Control Finance API metrics to Grafana Cloud using a Render Worker running Grafana Alloy.

## 1. Prerequisites

- API `/metrics` already enabled and protected with `METRICS_AUTH_TOKEN`.
- Grafana Cloud stack available (Prometheus/Mimir).
- Render account with Worker service support.

## 2. Create Grafana Cloud credentials

In Grafana Cloud:
1. Open your stack.
2. Copy the Prometheus `remote_write` URL.
3. Create an API key with `MetricsPublisher` (or equivalent write permission).
4. Collect:
   - `GRAFANA_CLOUD_REMOTE_WRITE_URL`
   - `GRAFANA_CLOUD_USERNAME`
   - `GRAFANA_CLOUD_API_KEY`

## 3. Deploy Alloy Worker on Render

Use `ops/alloy/` as Docker context.

Set environment variables in Render Worker:
- `API_HOST=control-finance-react-tailwind.onrender.com`
- `ENVIRONMENT=prod`
- `SCRAPE_INTERVAL=30s`
- `SCRAPE_TIMEOUT=10s`
- `METRICS_AUTH_TOKEN=<same token used by API>`
- `GRAFANA_CLOUD_REMOTE_WRITE_URL=<from Grafana Cloud>`
- `GRAFANA_CLOUD_USERNAME=<from Grafana Cloud>`
- `GRAFANA_CLOUD_API_KEY=<from Grafana Cloud>`

## 4. Verify ingestion

In Grafana Explore, run:

```promql
sum(rate(http_requests_total{job="control-finance-api"}[5m]))
```

Expected: value greater than `0` when API receives traffic.

## 5. Dashboard and alerts assets

- Dashboard JSON: `docs/observability/dashboards/control-finance-api-min.json`
- Alert rules: `docs/observability/alerts/control-finance-api-alerts.yaml`

Import/apply these assets after ingestion is confirmed.
