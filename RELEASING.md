# Releasing

## Goal
Keep release, deploy, and runtime (`/health`) consistent and auditable.

## Release flow (7 steps)
1. Open a PR to `main` with the intended changes.
2. Ensure CI is green (lint/test/build).
3. Merge to `main` (prefer squash merge).
4. Create tag `vX.Y.Z` and publish a GitHub Release (when applicable).
5. Deploy:
   - API on Render
   - Web on Vercel
6. Execute the production runbook checklist after deploy.
7. Record evidences for the release (links, `/health` output, smoke + monitoring outcome).

## References
- Production runbook: `docs/runbooks/release-production-checklist.md`
- PR template: `.github/pull_request_template.md`

## Golden rule (post-deploy)
After deploy, validate that runtime matches the intended release:
- `/health.version` is the expected API version
- `/health.commit` is the expected commit running in production
