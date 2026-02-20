# Observability SLO Baseline

## Scope
This document defines the initial availability objective for Control Finance API based on the `/health` endpoint.

## Service Level Indicator (SLI)

### Availability SLI
Percentage of successful health checks (`HTTP 200`) for:

`GET /health`

Measurement window:
- rolling 30 days

Success criteria:
- HTTP status code is `200`

Failure criteria:
- any non-200 status code (`4xx` or `5xx`)
- timeout or network error

Formula:

`availability = successful_checks / total_checks * 100`

## Service Level Objective (SLO)

- Availability target: `>= 99.5%` over 30 days.

### Error Budget
- Allowed unavailability per 30-day window: `0.5%`.
- 30 days ~= 43,200 minutes.
- Error budget: `43,200 * 0.005 = 216 minutes`.

## Alerting Baseline (UptimeRobot)

Recommended monitor settings:
- Monitor type: `HTTP(s)`
- URL: `https://control-finance-react-tailwind.onrender.com/health`
- Check interval: `1 minute`
- Timeout: `10 seconds`
- Trigger threshold: `2 consecutive failures` (~2 minutes)

## Severity Mapping
- `P1`: health endpoint unavailable for more than 2 minutes.
- `P2`: partial degradation or recurring intermittent errors.
- `P3`: informational or low-impact signal.

## Operational Notes
- This baseline is intentionally simple and low-risk.
- Latency SLOs and endpoint-level error SLOs are planned for the next observability increment (Grafana/Prometheus alerting).
