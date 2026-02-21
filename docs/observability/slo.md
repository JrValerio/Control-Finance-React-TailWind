# Observability SLO Baseline

## Scope
This document defines the minimum SLO baseline for Control Finance API with two production signals:
- `/health` availability (external monitor)
- API `5xx` error ratio (Prometheus metric)

## Service Level Indicators (SLI)

### 1) Health Availability SLI
Percentage of successful health checks (`HTTP 200`) for:

`GET /health`

Measurement window:
- rolling 30 days

Success criteria:
- `HTTP 200`

Failure criteria:
- any non-200 status code
- timeout or network error

Formula:

`availability = successful_checks / total_checks * 100`

### 2) API 5xx Error Ratio SLI
Percentage of API requests that return `5xx`, using:

`http_requests_total{job="control-finance-api"}`

Reference query (short window, operational):

```promql
(
  sum(rate(http_requests_total{job="control-finance-api", status="5xx"}[5m]))
  /
  clamp_min(sum(rate(http_requests_total{job="control-finance-api"}[5m])), 0.001)
)
```

Measurement window:
- rolling 30 days (SLO)
- rolling 5 minutes (alerting)

## Service Level Objectives (SLO)

- Availability target: `>= 99.5%` over 30 days
- 5xx ratio target: `<= 1.0%` over 30 days

## Error Budgets

- Availability budget: `0.5%` unavailability
  - 30 days ~= 43,200 minutes
  - budget ~= `216 minutes` per 30 days
- 5xx budget: `1.0%` of total requests per 30 days

## Alerting Baseline

Reference rules are versioned in:
- `docs/observability/alerts/control-finance-api-alerts.yaml`

Current baseline:
- `ControlFinanceApi5xxRateHigh` (`P1`): 5xx rate `> 0.2 req/s` for 5 minutes
- `ControlFinanceApi5xxPercentHigh` (`P2`): 5xx ratio `> 2%` for 5 minutes
- `ControlFinanceTransactionsP95High` (`P2`): p95 latency on `/transactions` `> 500ms` for 10 minutes

Incident runbook:
- `docs/runbooks/api-5xx-incident.md`

## UptimeRobot Baseline

Recommended monitor settings:
- Monitor type: `HTTP(s)`
- URL: `https://control-finance-react-tailwind.onrender.com/health`
- Check interval: `1 minute`
- Timeout: `10 seconds`
- Trigger threshold: `2 consecutive failures`

## Severity Mapping

- `P1`: sustained high 5xx rate or health endpoint unavailable for more than 2 minutes
- `P2`: elevated 5xx ratio or recurring endpoint degradation
- `P3`: informational or low-impact operational signal
