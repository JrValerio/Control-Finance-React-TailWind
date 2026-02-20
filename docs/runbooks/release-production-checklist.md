# Release Production Checklist

## Objective
Standardize post-release verification for API + Web in production, with traceable and repeatable steps.

## 1. Deploy Verification (Infrastructure)

### API (Render)
- [ ] Confirm active commit equals release commit (example: `f4f7a4e`).
- [ ] Check startup logs:
  - [ ] `runMigrations()` executed successfully.
  - [ ] No duplicate migration errors.
  - [ ] `schema_migrations` updated when release includes new migrations.
  - [ ] No Postgres connection errors.
- [ ] Confirm `GET /health` returns:
  - [ ] `ok: true`
  - [ ] expected `version` and `commit`
  - [ ] `buildTimestamp` filled
  - [ ] `uptimeSeconds` greater than zero
  - [ ] `db.status = "ok"` with `latencyMs` reported
- [ ] Validate required environment variables:
  - [ ] `DATABASE_URL`
  - [ ] `JWT_SECRET`
  - [ ] `CORS_ORIGIN`
  - [ ] `TRUST_PROXY=1`
  - [ ] `APP_BUILD_TIMESTAMP` (set in Render deploy environment)

### Web (Vercel)
- [ ] Confirm latest deployment is from `main`.
- [ ] Confirm `VITE_API_URL` points to the public Render API URL.
- [ ] Confirm login/register requests do not fallback to localhost.
- [ ] Confirm no CORS 403 errors in browser console.

## 2. Functional Smoke Test (Ephemeral User)

Recommended sequence:

```text
register -> login -> budgets/transactions -> logout
```

Minimum flow:
- [ ] `POST /auth/register`
- [ ] `POST /auth/login`
- [ ] `GET /transactions`
- [ ] Create transaction
- [ ] Export CSV
- [ ] Soft delete + restore
- [ ] Logout

Optional automated smoke (categories v2 contract):
- [ ] Run `scripts/smoke-categories-v2.ps1 -BaseUrl "https://<api-host>"` and keep output as evidence.

## 3. Post-release Monitoring (15-30 min)

Monitor API logs for:
- [ ] `/auth/login`
- [ ] `/auth/register`
- [ ] `/transactions`
- [ ] `/transactions/export.csv`

Confirm:
- [ ] No 5xx errors.
- [ ] No unexpected 429 spike (rate limit).
- [ ] No CORS errors.

## 4. Incident Severity and Escalation

Severity criteria:
- **P1 (Critical):** production unavailable, sustained 5xx spike, auth failure for most users, or data integrity risk.
- **P2 (High):** major feature degraded with workaround, localized 5xx increase, or repeated import/export failures.
- **P3 (Medium/Low):** minor degradation, UI regressions without data-loss risk, intermittent non-critical issues.

Escalation flow:
1. Capture `requestId`, timestamp, impacted endpoint, and user impact scope.
2. Classify severity (P1/P2/P3) and notify owner on-call.
3. For P1: start rollback decision within 15 minutes.
4. For P2: create mitigation plan and keep monitoring window active.
5. For P3: register issue and schedule fix in next planned iteration.

## 5. Rollback Plan

If critical issue happens:
1. Identify last stable commit.
2. In Render, deploy that commit manually.
3. Re-check `GET /health`.
4. Record incident in runbook.

## 6. Runbook Entry (Per Release)

```md
Release: vX.Y.Z
Commit API:
Commit Web:
Date:
Owner:
Smoke test completed: yes/no
Ephemeral user used: yes/no
30 min monitoring completed: yes/no
Rollback required: yes/no
Notes:
```

## 7. Evidences (Per Release)

> Copy this block for each new release and keep history at the end of this file.

```md
Release: vX.Y.Z
Date:
Owner:

PR release:
Tag:
GitHub Release:
Commit main:
Commit runtime (`/health.commit`):

Render deploy (link):
Vercel deploy (link):
Output `/health` (json):
Smoke executed: yes/no
Monitoring 15-30 min: ok/not ok
Rollback needed: yes/no
Observations:
```

### Evidences - v1.13.1 (2026-02-20)

#### Git Integrity
- main HEAD: `b6e32de`
- tag `v1.13.1` -> `b6e32de` (annotated)

#### Production Smoke (Render)
Base: `https://control-finance-react-tailwind.onrender.com`

##### /health
- Status: `200`
- version: `1.13.1`
- commit: `b6e32defa94994acea4e143312e404a7c292a1b4`
- buildTimestamp: `2026-02-20T18:30:00Z`
- Result: OK

##### /metrics (no auth)
- Status: `403`
- Result: Protected as expected

#### Repro Commands (PowerShell)

```powershell
$api='https://control-finance-react-tailwind.onrender.com'

# health
$h = Invoke-RestMethod "$api/health"
$h | ConvertTo-Json -Depth 5

# metrics (negative control)
try {
  Invoke-WebRequest "$api/metrics" -TimeoutSec 15 | Out-Null
  "metrics(no-auth)=200"
} catch {
  "metrics(no-auth)=$($_.Exception.Response.StatusCode.value__)"
}
```

#### Conclusion
Production is aligned with `origin/main` and `v1.13.1` (version + commit).
Observability endpoints are behaving as expected.

## 8. Suggested Operational Sequence

For each release:
1. Open and merge PR.
2. Ensure CI is green.
3. Create tag and GitHub Release.
4. Deploy API and Web.
5. Execute this checklist.
6. Monitor for at least 30 minutes.
