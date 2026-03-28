# Tarnished CLI Feasibility Review

## Goal

Evaluate how hard it would be to build a Tarnished CLI that can interact with a running instance in a way that gives an agent nearly the same practical power as the browser UI.

This review is based on:

- frontend route inventory in `frontend/src/App.tsx`
- backend API inventory under `backend/app/api/`
- current auth dependencies in `backend/app/core/deps.py`
- current live/deployed baseline at `v0.1.0`

## Bottom Line

It is **very feasible** to build a Tarnished CLI.

It is **not** a backend rewrite problem. The browser already uses a broad REST API surface for almost everything important.

The real work is:

1. packaging a good CLI UX
2. making auth agent-friendly
3. smoothing over file/import/export flows
4. accepting that **browser-extension-only behavior** (DOM scanning, autofill on arbitrary pages) is not a pure CLI feature

## Difficulty Estimate

- **MVP CLI**: `2-4 days`
  - login
  - whoami
  - list/get/create/update/delete applications
  - list/get/create/retry/convert job leads
  - basic dashboard/analytics reads
  - statuses / round types / profile / API key commands

- **Near-browser parity CLI**: `1-2 weeks`
  - rounds
  - media uploads
  - transcript upload/delete
  - export/import validation/import progress
  - admin commands
  - stable JSON output for agents
  - shell completion / config file / pagination UX

- **Agent-grade CLI with low-friction automation**: `2-3 weeks`
  - consistent non-interactive auth
  - safer destructive command ergonomics
  - better bulk / compound operations
  - polished machine-readable output everywhere
  - optional watch / polling helpers for import progress and long-running operations

## What Already Exists

### Authentication

Already exposed:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

Current auth modes:

- JWT bearer works broadly for web-app endpoints
- API token auth exists already for extension-oriented or mixed endpoints
- flexible auth exists in `get_current_user_flexible`

This means a CLI can work **today** with JWT login + local token storage.

## Browser Feature Coverage

### Fully or Mostly CLI-Friendly Today

- **Auth**: register, login, refresh, me
- **Dashboard**:
  - `/api/dashboard/kpis`
  - `/api/dashboard/needs-attention`
  - `/api/streak`
- **Applications**:
  - list/get/create/update/delete
  - sources
  - extract-from-url
  - history list/delete
  - CV / cover-letter upload & delete
- **Job Leads**:
  - list/get/create/delete
  - sources
  - retry extraction
  - convert to application
- **Rounds / interview tracking**:
  - create/update/delete rounds
  - upload/delete media
  - upload/delete transcript
- **Profile / settings**:
  - profile read/write
  - statuses CRUD
  - round types CRUD
  - API key read/regenerate
  - user preferences
  - user theme settings
- **Analytics / insights**:
  - sankey
  - heatmap
  - KPIs
  - weekly activity
  - interview rounds
  - AI insights
- **Admin**:
  - users list/create/update/delete
  - stats
  - admin applications list
  - admin AI settings
  - default status / round type updates
- **Import / export**:
  - export JSON / CSV / ZIP
  - import validate
  - import execute
  - import progress polling
- **Files**:
  - direct file fetch endpoints
  - signed URL endpoints

### Not True CLI Parity

These are browser behaviors, not just server capabilities:

- browser extension page scanning
- autofill into arbitrary web forms
- page DOM extraction from the currently open tab
- browser-native preview UX for files / PDFs / transcripts
- theme/toast/navigation behavior

The CLI can replace the **web app** well.
It cannot replace the **extension’s DOM automation** without adding browser automation.

## Main Gaps For An Agent-Friendly CLI

### 1. Auth Is Good Enough For Humans, Not Ideal For Agents

Current state:

- many endpoints require JWT-only auth (`get_current_user`)
- some endpoints already accept API key / flexible auth

Implication:

- a CLI can be built now using username/password login and refresh tokens
- an autonomous agent would be more reliable with a single personal-access-token style auth model that works everywhere

Recommended backend change:

- widen more CLI-facing endpoints from `get_current_user` to `get_current_user_flexible` where safe
- or introduce an explicit CLI / PAT dependency and standardize around it

### 2. File Workflows Need CLI Wrappers

The API already supports files, but the CLI will need:

- upload helpers for CV / cover letter / transcript / media
- download helpers that hide signed-URL details
- sane output paths and overwrite controls

### 3. Import / Export Need Better Long-Running UX

The endpoints exist already.
The CLI still needs:

- streaming-friendly export download UX
- import validate + import trigger + progress polling orchestration
- safe default behavior for destructive import actions

### 4. Multi-Step Agent Flows Are Low-Level

An agent can already do the work, but it may require multiple round trips:

- login
- fetch statuses
- create application
- upload files
- create rounds
- fetch analytics

This is acceptable for a first CLI.
Later, a few convenience subcommands or compound endpoints would make agents much cleaner.

## Recommended CLI Architecture

### Recommended Stack

Use **Python + Typer + httpx** inside this repo.

Why:

- backend is already Python
- schemas and domain language are already in Python / Pydantic
- easy packaging in the existing `backend/pyproject.toml`
- straightforward JSON output for agent use

### Recommended Layout

- `backend/app/cli/`
  - `main.py`
  - `config.py`
  - `auth.py`
  - `output.py`
  - `commands/`
    - `applications.py`
    - `job_leads.py`
    - `rounds.py`
    - `settings.py`
    - `analytics.py`
    - `admin.py`
    - `import_export.py`
    - `files.py`

### Recommended UX Conventions

- `tarnished auth login`
- `tarnished auth whoami`
- `tarnished applications list --json`
- `tarnished applications create ...`
- `tarnished job-leads retry <id>`
- `tarnished import validate file.zip`
- `tarnished import run file.zip --wait`
- `tarnished admin users list`

Important for agent use:

- `--json` on every read command
- stable exit codes
- no interactive prompts unless explicitly requested
- `--yes` gates for destructive operations

## Suggested Delivery Plan

### Phase 1: Useful Fast

Build:

- auth
- applications
- job leads
- statuses
- profile
- dashboard / analytics reads

This alone would already make Tarnished agent-friendly for most day-to-day workflows.

### Phase 2: Browser-Parity Operations

Add:

- rounds
- files
- export / import
- admin
- AI settings

### Phase 3: Agent Optimization

Add:

- wider token auth coverage
- bulk operations
- better machine-readable summaries
- import progress waiters
- safer destructive UX

## Recommendation

If the goal is "let my agent operate Tarnished like a power user," build the CLI.

The recommended path is:

1. ship `0.1.1` first if release pressure is higher
2. then build a Python CLI as a thin API client
3. standardize agent-friendly auth before calling it full-parity

If the goal is "let my agent work Tarnished without the browser," the CLI is **absolutely worth doing** and the current API is already strong enough to support an MVP quickly.
