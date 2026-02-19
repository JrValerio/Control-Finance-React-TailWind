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
- [ ] Confirm `GET /health` returns `{ ok: true, version, commit }`.
- [ ] Validate required environment variables:
  - [ ] `DATABASE_URL`
  - [ ] `JWT_SECRET`
  - [ ] `CORS_ORIGIN`
  - [ ] `TRUST_PROXY=1`

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

## 4. Rollback Plan

If critical issue happens:
1. Identify last stable commit.
2. In Render, deploy that commit manually.
3. Re-check `GET /health`.
4. Record incident in runbook.

## 5. Runbook Entry (Per Release)

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

## 6. Evidences (Per Release)

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

## 7. Suggested Operational Sequence

For each release:
1. Open and merge PR.
2. Ensure CI is green.
3. Create tag and GitHub Release.
4. Deploy API and Web.
5. Execute this checklist.
6. Monitor for at least 30 minutes.
