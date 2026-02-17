# Release production checklist

## Goal
Keep release, deploy, and runtime (`/health`) consistent.

## Steps
1. Merge PRs to `main`
- Ensure CI is green.

2. Tag + Release
- Create tag `vX.Y.Z` on `main`.
- Publish GitHub Release for the same tag.

3. Render (API service)
- Click **Deploy latest commit** (optionally: clear cache if needed).
- Optional: set `APP_VERSION=X.Y.Z` only if you want an explicit runtime override.

4. Verify runtime
Run:

```powershell
$api='https://control-finance-react-tailwind.onrender.com/health'
Invoke-RestMethod -Uri $api -Method Get | ConvertTo-Json -Compress
```

Expected:
- `version` matches the API package version (`apps/api/package.json`).
- `commit` matches `origin/main` at the release tag.

Note:
`/health.version` reflects the API package version (`apps/api/package.json`),
not the Git tag. Release tags may differ when a release is observability-only
(e.g. no package version bump).
