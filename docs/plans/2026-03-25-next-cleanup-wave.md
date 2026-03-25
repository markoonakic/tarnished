# Next Cleanup Wave Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Continue systematic cleanup after the compaction handoff by shrinking the next major hotspots, tightening behavior around form/state logic, and doing another evidence-driven repo sweep for additional high-value fixes.

**Architecture:** Keep extracting cohesive logic slices behind small helper modules instead of rewriting whole files. Prefer helper/state/boundary modules that are easy to test directly, use failing tests first for each extraction, and commit after each verified chunk so the branch stays easy to audit and hand off.

**Tech Stack:** React 19, TypeScript, Vitest, Vite, WebExtension API, FastAPI, Pyright, Helm

---

### Task 1: Compact Application Modal Form Logic

**Files:**
- Modify: `frontend/src/components/ApplicationModal.tsx`
- Create: `frontend/src/lib/applicationModalForm.ts`
- Test: `frontend/src/lib/applicationModalForm.test.ts`

**Step 1: Write the failing test**

Add helper tests for the most coupled modal logic first:
- URL normalization/validation
- textarea-to-array conversion for requirements
- payload building differences between create and edit flows

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run src/lib/applicationModalForm.test.ts`
Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Extract only the pure logic into `frontend/src/lib/applicationModalForm.ts` and update `frontend/src/components/ApplicationModal.tsx` to call it.

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn lint && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/ApplicationModal.tsx frontend/src/lib/applicationModalForm.ts frontend/src/lib/applicationModalForm.test.ts
git commit -m "refactor: compact frontend application modal logic"
```

### Task 2: Compact Next Extension Logic Hotspot

**Files:**
- Inspect/modify: `extension/src/lib/errors.ts`
- Inspect/modify: `extension/src/lib/detection.ts`
- Create: one focused helper module if needed
- Test: one new focused test file

**Step 1: Write the failing test**

Choose the higher-value hotspot after a quick read. Prefer the one with the most mixed concerns or repeated mapping logic. Add a failing test around one extracted behavior, not the entire module.

**Step 2: Run test to verify it fails**

Run: `cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run <new-test-file>`
Expected: FAIL because the extracted boundary or helper does not exist yet.

**Step 3: Write minimal implementation**

Extract a single cohesive slice and keep the public behavior unchanged.

**Step 4: Run test to verify it passes**

Run: `cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build`
Expected: PASS

**Step 5: Commit**

```bash
git add extension/src
git commit -m "refactor: compact extension <hotspot>"
```

### Task 3: Run Another Evidence-Driven Whole-Repo Sweep

**Files:**
- Inspect: whole repo
- Modify: only files tied to one concrete high-value finding
- Test: smallest test file that proves the fix

**Step 1: Write the failing test**

From the sweep, choose one concrete bug, brittle path, or dead-code cleanup that can be proven with a focused test. Add that test first.

**Step 2: Run test to verify it fails**

Run the smallest relevant command for that new test.
Expected: FAIL for the expected reason.

**Step 3: Write minimal implementation**

Fix only the selected finding. Do not mix in unrelated cleanup.

**Step 4: Run test to verify it passes**

Run the local package verification plus any repo-wide sweeps that motivated the fix.
Expected: PASS, with the smell count or hotspot evidence improved or documented.

**Step 5: Commit**

```bash
git add <relevant-files>
git commit -m "fix: address <specific finding>"
```

### Task 4: Final Verification and Handoff Refresh

**Files:**
- Update: `docs/plans/2026-03-25-compaction-handoff.md`
- Update: `docs/plans/2026-03-25-next-cleanup-wave.md`

**Step 1: Run the final sweeps**

```bash
python3 <largest-files-script>
rg -n "except Exception|TODO|FIXME|window.location.reload|console\." .
cd backend && uv run pytest -q && uv run pyright
cd frontend && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn lint && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build
cd extension && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn exec tsc --noEmit && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn test:run && npm exec --package=@yarnpkg/cli-dist@4.12.0 -- yarn build
cd .. && helm lint chart && helm template tarnished chart
```

**Step 2: Refresh documentation**

Update the handoff with:
- what was completed in this wave
- exact verification evidence
- what remains and why it is prioritized
- which smells are intentional debt vs still worth fixing soon

**Step 3: Commit**

```bash
git add -f docs/plans/2026-03-25-compaction-handoff.md docs/plans/2026-03-25-next-cleanup-wave.md
git commit -m "docs: refresh cleanup wave handoff"
```

---

## Execution Notes

- Completed in this worktree on `2026-03-25`.
- Finished chunks:
  - `5ee6639` `refactor: compact frontend application modal logic`
  - `4f2e434` `refactor: compact extension error mapping`
  - `9ad53c2` `fix: remove popup api barrel dynamic import`
- Latest verification evidence:
  - `backend`: `293 passed, 1 skipped`; `0 errors, 0 warnings`
  - `frontend`: lint, typecheck, tests, and build pass
  - `extension`: typecheck, tests, and build pass; the previous API barrel chunk warning is gone
  - `helm`: lint and template pass
- Remaining likely next targets after this wave:
  1. `frontend/src/pages/Admin.tsx`
  2. `extension/src/content/iframe-scanner.ts`
  3. backend extraction/import broad-handler review only if a concrete failing case is identified first
