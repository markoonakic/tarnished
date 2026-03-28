# 0.1.1 Release Readiness Checklist

## Scope

This checklist covers the `systematic-cleanup-audit` worktree as a candidate for `0.1.1`, compared against the deployed `v0.1.0` baseline.

It assumes:

- code verification stays green
- the user performs a short final manual pass before merge / release / deploy

## Automated Verification Completed

### Code Verification

- backend tests: `294 passed, 1 skipped`
- backend pyright: `0 errors, 0 warnings`
- frontend: lint, typecheck, tests, and production build pass
- extension: typecheck, tests, and production build pass
- helm: lint and template pass earlier in this audit wave

### Local Upgrade-Safety Environment

Built and tested a local release-candidate environment using:

- current worktree image
- copied PostgreSQL data from the live `v0.1.0` instance
- local DB container: Postgres 17
- local app URL: `http://127.0.0.1:5577`

Key checks:

- health endpoint healthy
- setup status false on copied instance
- login works
- copied data loads
- app can write new records safely on copied data

### Browser / Functional QA Completed

Verified on the local copied-data instance:

- login flow works for local QA account
- dashboard loads without console errors
- applications list loads
- hard reload preserves authenticated session
- applications search no-match state works
- clearing search restores results
- creating a new application through the browser UI works
- new application detail page survives reload

Evidence:

- browser-created record persisted in copied DB:
  - `Expect QA Co | Expect Smoke Role`

### Import / Export Safety Checks

- ZIP export succeeded for local QA user
- ZIP import validation succeeded against the exported archive
- validation summary:
  - `applications: 2`
  - `rounds: 0`
  - `status_history: 2`
  - `job_leads: 0`
  - `files: 0`
  - `error_count: 0`

### AI Provider Smoke

Verified on the local copied-data instance:

- local admin AI settings accepted a Cerebras-backed configuration
- `/api/analytics/insights/configured` returned `true`
- `/api/analytics/insights` completed successfully end-to-end

Confirmed working through Tarnished:

- `cerebras/llama3.1-8b`
- `cerebras/qwen-3-235b-a22b-instruct-2507`

## Concrete Fixes Included In This Final Sweep

- Admin search now filters server-side and preserves correct totals/pagination.
- Extension iframe autofill no longer broadcasts profile data to unrelated iframes.
- Expect / Codex QA path fixed by changing Codex reasoning effort from unsupported `xhigh` to supported `high` in local Codex config.

## Manual Verification Required Before Merge

Use the local copied-data candidate first.

### Manual Local Pass

Target:

- `http://127.0.0.1:5577`

Suggested checks:

1. Log in as `qa-local@example.com`
2. Open dashboard, applications, application detail, settings
3. Confirm search / filters feel correct
4. Create or edit one harmless application
5. Verify no obvious broken navigation or missing styling

Optional admin pass:

- `qa-admin@example.com`
- confirm Admin page loads and user search behaves as expected

### Manual Pre-Release Sanity

Before merge / release / deploy:

1. Confirm `git status` only contains intended product changes
2. Do not accidentally include local QA/tool artifacts unless intentionally desired
3. Confirm local app on copied data still boots cleanly
4. Reconfirm live production instance is healthy before cutting release

## Non-Product Artifacts To Review Before Commit

Current worktree may contain local QA/tooling artifacts that should likely stay out of the product commit:

- `.agents/`
- `skills-lock.json`

Review these explicitly before staging.

## Recommended Release Sequence

1. User manual pass on local copied-data instance
2. Final review of git diff / staged files
3. Commit product changes only
4. Merge branch to `main`
5. Cut `0.1.1` version / release metadata
6. Publish image / chart as needed
7. Deploy
8. Run post-deploy smoke test against the real instance
9. User manual spot-check on deployed app

## After Release

Start a dedicated CLI branch using:

- `docs/plans/2026-03-28-cli-feasibility-review.md`

Recommended starting point:

- Python CLI in `backend/app/cli/`
- phase 1: auth, applications, job leads, settings, analytics reads
