# Compaction Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Safely compact the remaining architecture hotspots and finish the current cleanup campaign without losing context, regressing behavior, or re-exploring solved areas.

**Architecture:** The large-risk backend contracts are already stabilized; the remaining work is mostly module compaction, warning reduction, and repeated audit passes. Keep extracting cohesive slices behind small boundaries, prefer test-backed moves over mechanical churn, and do one full verification pass after each chunk.

**Tech Stack:** FastAPI, SQLAlchemy, React 19, TypeScript, Vitest, Vite, WebExtension API, Helm, GitHub Actions

---

## Current State

- Branch/worktree:
  - Branch: `systematic-cleanup-audit`
  - Worktree: `/Users/marko/Projects/job-tracker/.worktrees/systematic-cleanup-audit`
- Verified repo state at handoff:
  - `backend`: `uv run pytest -q` -> `293 passed, 1 skipped`
  - `backend`: `uv run pyright` -> `0 errors, 0 warnings`
  - `frontend`: `yarn lint && yarn exec tsc --noEmit && yarn test:run && yarn build` -> passes
  - `extension`: `yarn exec tsc --noEmit && yarn test:run && yarn build` -> passes
  - `helm`: previously verified passing after startup probe hardening
  - `git status --short --branch` -> clean

## Major Work Already Completed

- Backend architecture cleanup:
  - AI settings centralized into `backend/app/services/ai_settings.py`
  - job HTML fetching extracted to `backend/app/services/job_fetch.py`
  - import validation extracted to `backend/app/services/import_validation.py`
  - import execution extracted to `backend/app/services/import_execution.py`
  - `backend/app/api/import_router.py` reduced from ~1200 lines to ~462 lines, then further simplified
  - dead import-router helper copies removed
- Backend contract/error cleanup:
  - typed `HTTPException` paths preserved in `applications.py` and `insights.py`
  - import validation/runtime `ValueError` paths preserved as client-visible failures
  - job lead retry `ValueError` now returns `400`
  - zip utility broad handlers narrowed
- Frontend:
  - shared auth request path consolidated in `frontend/src/lib/api.ts`
  - helper tests added with Vitest
  - preference/prompt handling improved in `frontend/src/contexts/ThemeContext.tsx` and `frontend/src/pages/Dashboard.tsx`
- Extension:
  - Vitest added and wired into CI
  - popup split into modules:
    - `extension/src/popup/view.ts`
    - `extension/src/popup/detection.ts`
    - `extension/src/popup/actions.ts`
    - `extension/src/popup/settings.ts`
    - `extension/src/popup/autofill.ts`
    - `extension/src/popup/save-job-lead.ts`
    - `extension/src/popup/state.ts`
  - API client split into:
    - `extension/src/lib/api-core.ts`
    - `extension/src/lib/api-job-leads.ts`
    - `extension/src/lib/api-applications.ts`
    - `extension/src/lib/api-user.ts`
    - `extension/src/lib/api.ts` as barrel
  - popup notification and theme/bootstrap helpers extracted to:
    - `extension/src/popup/notifications.ts`
    - `extension/src/popup/bootstrap.ts`
  - background icon rendering extracted to:
    - `extension/src/background/icon.ts`
- CI / deployment:
  - frontend and extension Vitest suites enforced in `.github/workflows/ci.yml`
  - startup probe hardening added to chart
- Frontend:
  - application detail state transitions extracted to:
    - `frontend/src/lib/applicationDetailState.ts`
- Backend:
  - final `backend/tests/test_api_endpoints.py` pyright warnings removed

## Recent Commit Sequence

- `55227a8` `refactor: extract import execution service`
- `6cd545c` `chore: remove dead import router helpers`
- `319ac3a` `refactor: extract popup view state helpers`
- `7b06e91` `refactor: extract popup detection helpers`
- `e4f676a` `refactor: extract popup action handlers`
- `e705937` `refactor: extract popup settings controller`
- `cc8ff24` `refactor: extract popup autofill workflow`
- `9c28954` `refactor: extract popup save lead flow`
- `9a11687` `refactor: extract popup state controller`
- `e158a50` `refactor: split extension api client`
- `20d0994` `refactor: harden frontend preference flows`
- `7cd51d9` `chore: reduce backend test typing noise`
- `649f279` `refactor: finish popup wiring split`
- `2913a65` `refactor: compact extension background icon flow`
- `ed5e667` `refactor: compact frontend application detail state`
- `d448e36` `chore: finish backend typing cleanup`

---

### Task 1: Compact Remaining Popup Wiring

**Files:**
- Modify: `extension/src/popup/index.ts`
- Test: `extension/src/popup/*.test.ts`

**Step 1: Write the failing test**

Add a boundary assertion or module-focused test proving `extension/src/popup/index.ts` is only responsible for initialization and wiring, not feature logic.

**Step 2: Run test to verify it fails**

Run: `cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run src/architecture/*.test.ts`
Expected: FAIL if the new boundary assertion catches remaining direct logic in `index.ts`.

**Step 3: Write minimal implementation**

Extract any remaining cohesive helpers from `extension/src/popup/index.ts`, especially event-listener glue or notification wrappers that still cause the file to stay large.

**Step 4: Run test to verify it passes**

Run: `cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build`
Expected: PASS

**Step 5: Commit**

```bash
git add extension/src/popup
git commit -m "refactor: finish popup wiring split"
```

### Task 2: Sweep Extension for Next Hotspot

**Files:**
- Inspect: `extension/src/lib/errors.ts`
- Inspect: `extension/src/lib/detection.ts`
- Inspect: `extension/src/background/index.ts`

**Step 1: Write the failing test**

Add the smallest architectural boundary test for whichever file is still the biggest/highest-coupling hotspot after Task 1.

**Step 2: Run test to verify it fails**

Run: `cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run <new-test-file>`
Expected: FAIL due to missing boundary extraction.

**Step 3: Write minimal implementation**

Extract one cohesive slice only. Do not do broad cleanup across all extension files at once.

**Step 4: Run test to verify it passes**

Run: `cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build`
Expected: PASS

**Step 5: Commit**

```bash
git add extension/src
git commit -m "refactor: compact extension <hotspot>"
```

### Task 3: Finish Frontend Hotspot Pass

**Files:**
- Inspect/modify: `frontend/src/pages/ApplicationDetail.tsx`
- Inspect/modify: `frontend/src/components/ApplicationModal.tsx`
- Inspect/modify: `frontend/src/contexts/ThemeContext.tsx`
- Inspect/modify: `frontend/src/pages/Dashboard.tsx`

**Step 1: Write the failing test**

Add the smallest helper or boundary test for the worst remaining frontend hotspot. If no direct component test is practical, add helper coverage for extracted state/logic modules first.

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run <new-test-file>`
Expected: FAIL before extraction.

**Step 3: Write minimal implementation**

Extract one logic cluster at a time. Priority order:
1. stateful logic in `ApplicationDetail.tsx`
2. modal submission/state logic in `ApplicationModal.tsx`
3. any remaining brittle preference/reload behavior

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn lint && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src
git commit -m "refactor: compact frontend <hotspot>"
```

### Task 4: Remove Last Backend Typing Noise

**Files:**
- Modify: `backend/tests/test_api_endpoints.py`

**Step 1: Write the failing test**

Not needed if only addressing pyright warning signatures. Use pyright as the failing signal for this task.

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pyright`
Expected: `3 warnings` remaining in `backend/tests/test_api_endpoints.py`

**Step 3: Write minimal implementation**

Fill the last `JobLeadExtractionInput(...)` optional fields explicitly so pyright stops reporting missing parameters.

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pyright && uv run pytest -q`
Expected: `0 errors, 0 warnings` if the final warnings are fully removed, or document exact residual warnings if pyright still surfaces any unexpected noise.

**Step 5: Commit**

```bash
git add backend/tests/test_api_endpoints.py
git commit -m "chore: finish backend typing cleanup"
```

### Task 5: Final Multi-Sweep Compaction Audit

**Files:**
- Inspect entire repo
- Update: `docs/plans/2026-03-25-compaction-handoff.md`

**Step 1: Write the failing test**

Use architectural boundary assertions or grep-based smell counts where helpful. This task is mostly audit/reporting, not product behavior.

**Step 2: Run test to verify it fails**

Run the same classes of sweeps that found prior issues:

```bash
python3 <largest-files-script>
git grep -n "except Exception\|TODO\|FIXME\|window.location.reload\|console\." -- .
cd backend && uv run pyright
cd frontend && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run
cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run
```

Expected: Identify any remaining true hotspots and separate them from acceptable debt.

**Step 3: Write minimal implementation**

Only fix issues that are still obviously high-value. Otherwise update this handoff with:
- what is done
- what remains
- which remaining items are actual priorities vs optional debt

**Step 4: Run test to verify it passes**

Run all relevant verification one final time:

```bash
cd backend && uv run pytest -q && uv run pyright
cd frontend && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn lint && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build
cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build
cd .. && helm lint chart && helm template tarnished chart
```

Expected: PASS, with any remaining debt documented clearly.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-25-compaction-handoff.md
git commit -m "docs: refresh compaction handoff"
```

---

## Current Remaining Hotspots After Latest Sweep

- Backend biggest files:
  - `backend/tests/test_api_endpoints.py` (large but now pyright-clean; treat as test-debt, not an active warning source)
  - `backend/app/api/job_leads.py`
  - `backend/app/api/analytics.py`
  - `backend/app/api/applications.py`
  - `backend/app/services/extraction.py`
  - `backend/app/services/import_service.py`
- Frontend biggest files:
  - `frontend/src/components/ApplicationModal.tsx`
  - `frontend/src/pages/Admin.tsx`
  - `frontend/src/pages/ApplicationDetail.tsx`
- Extension biggest files:
  - `extension/src/popup/index.ts`
  - `extension/src/lib/errors.ts`
  - `extension/src/lib/detection.ts`
  - `extension/src/content/iframe-scanner.ts`

## Latest Audit Notes

- Final Task 5 verification rerun completed on `2026-03-25` after Tasks 1-5 were executed in this worktree.
- Verified after Tasks 1-4:
  - `backend`: `uv run pyright` -> `0 errors, 0 warnings`
  - `backend`: `uv run pytest -q` -> `293 passed, 1 skipped`
  - `frontend`: `yarn lint && yarn exec tsc --noEmit && yarn test:run && yarn build` -> passes
  - `extension`: `yarn exec tsc --noEmit && yarn test:run && yarn build` -> passes
  - `helm`: `helm lint chart && helm template tarnished chart` -> passes
- Grep-based smell sweep still finds a few intentional or lower-priority items:
  - `frontend/src/components/ErrorBoundary.tsx` still uses `console.error` and `window.location.reload()` as explicit last-resort recovery behavior
  - `extension/src/lib/logger.ts` is expected to wrap `console.*`
  - several backend `except Exception` handlers remain in extraction/import/security paths and should be treated as targeted follow-up work, not blanket cleanup
- Extension build still emits the known Vite warning that `extension/src/lib/api.ts` is both dynamically and statically imported; this remains non-blocking cleanup debt.
- Highest-value remaining product-facing cleanup appears to be:
  1. `frontend/src/components/ApplicationModal.tsx`
  2. `extension/src/lib/errors.ts` or `extension/src/lib/detection.ts`
  3. `frontend/src/pages/Admin.tsx`

## Important Context For Next Agent

- Do not re-open the already-solved backend contract issues unless new evidence appears.
- The extension popup has already been split several times; continue that style instead of rewriting it wholesale.
- `extension/src/lib/api.ts` is intentionally now a barrel file; do not move fetch logic back into it.
- The repo still has a few intentional broad fallback handlers; not every `except Exception` is automatically the next best fix.
- The frontend pre-commit hook shells out to `yarn`; in this environment commits needed a PATH prefix that points at the Yarn 4 npm-exec binary so Husky does not fall back to global Yarn 1.
- Keep using small, verified commits. The existing commit history on this branch is the best map of what was already stabilized.
