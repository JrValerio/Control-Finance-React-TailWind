# Grafana Alloy Worker

This worker scrapes Control Finance API metrics from `/metrics` using Bearer authentication and forwards the data to Grafana Cloud via `remote_write`.

## Render Worker Setup

Deploy this folder as a Docker-based Render Worker service.

Required environment variables:
- `API_HOST` (example: `control-finance-react-tailwind.onrender.com`)
- `ENVIRONMENT` (example: `prod`)
- `SCRAPE_INTERVAL` (recommended: `30s`)
- `SCRAPE_TIMEOUT` (recommended: `10s`)
- `METRICS_AUTH_TOKEN` (same token expected by API `/metrics`)
- `GRAFANA_CLOUD_REMOTE_WRITE_URL`
- `GRAFANA_CLOUD_USERNAME`
- `GRAFANA_CLOUD_API_KEY`

## Local Run (Docker)

```bash
docker build -t control-finance-alloy ./ops/alloy

docker run --rm \
  -e API_HOST="control-finance-react-tailwind.onrender.com" \
  -e ENVIRONMENT="prod" \
  -e SCRAPE_INTERVAL="30s" \
  -e SCRAPE_TIMEOUT="10s" \
  -e METRICS_AUTH_TOKEN="***" \
  -e GRAFANA_CLOUD_REMOTE_WRITE_URL="https://prometheus-prod-xx.grafana.net/api/prom/push" \
  -e GRAFANA_CLOUD_USERNAME="***" \
  -e GRAFANA_CLOUD_API_KEY="***" \
  control-finance-alloy
```

## Validation

1. Worker logs should not show 401/403 for `/metrics`.
2. In Grafana Explore, run:

```promql
sum(rate(http_requests_total{job="control-finance-api"}[5m]))
```

If the query returns data, scrape + remote_write is working.
