# Tarnished CLI Design

Date: 2026-03-28
Status: Approved for planning
Branch: `cli-phase-1`

## Goal

Build an agent-first Tarnished CLI that can reach near-web-app parity over the existing HTTP API surface without introducing avoidable drift between the CLI, backend, and web UI.

The CLI should be safe for real data, easy to script, and maintainable as Tarnished evolves.

## Context

Tarnished already exposes most of the required functionality through FastAPI endpoints. The browser UI is primarily an HTTP client over those endpoints.

That means the CLI is not a backend rewrite problem. The main work is:

1. hardening backend seams that would make an agent CLI brittle
2. building a thin in-repo CLI client
3. expanding the command surface in phases until it reaches parity

## Design Principles

### 1. Thin HTTP Client Only

The CLI must talk only to Tarnished's HTTP API. It must not access the database directly or call backend service internals as a shortcut.

This is the main anti-drift rule. Backend contracts remain the source of truth.

### 2. Agent-First UX

The CLI is primarily for agents, not humans. Design decisions should favor machine-readability and non-interactive execution.

Required implications:

- `--json` must be supported on every read command
- `stdout` is reserved for primary data
- `stderr` is used for progress, warnings, and human-oriented hints
- write commands should prefer structured JSON input over many ad hoc flags
- destructive actions require explicit confirmation flags like `--yes`

### 3. Fix Only CLI-Relevant Backend Debt First

Do not pause for a full backend cleanup. Fix only the backend issues that directly affect CLI quality, safety, or maintainability:

- auth inconsistency across endpoints
- unstable or UI-shaped response contracts
- missing safety/idempotency on risky write paths
- obvious bad boundaries in the modules the CLI directly depends on

### 4. Phase The Work

This program is too large to do as a single implementation blob without accumulating avoidable risk. It should be executed in ordered phases that each leave the system in a working, testable state.

## Recommended Stack

Use an in-repo Python CLI:

- Python 3.12
- Typer
- httpx
- Pydantic

Rationale:

- backend is already Python/FastAPI/Pydantic
- this minimizes contract drift and maintenance cost
- this is the fastest path to a useful CLI
- CLI performance will be dominated by API and LLM latency, not local CPU performance

Do not start with Go or Rust.

Do not start with full OpenAPI code generation.

## CLI Architecture

The CLI should live under:

- `backend/app/cli/`

Recommended initial layout:

- `backend/app/cli/main.py`
- `backend/app/cli/state.py`
- `backend/app/cli/client.py`
- `backend/app/cli/output.py`
- `backend/app/cli/config.py`
- `backend/app/cli/auth_storage.py`
- `backend/app/cli/input.py`
- `backend/app/cli/commands/`

Typer structure should use:

- a root app callback for shared state and global flags
- nested command groups via `add_typer()`
- Typer `CliRunner` tests for command behavior

## Auth Strategy

### Initial CLI Auth

The first usable CLI should use the current Tarnished auth model:

- username/password login
- access token + refresh token
- automatic refresh when appropriate

This is the fastest path to a working CLI and avoids inventing a new auth product surface before the CLI exists.

### Hardening Direction

The auth layer must not be designed as JWT-only forever. The backend hardening phase should normalize which CLI-facing endpoints use:

- `get_current_user`
- `get_current_user_flexible`
- `get_current_user_by_api_token`

The CLI client should hide that complexity behind one auth abstraction so that a future PAT or CLI-token model can be introduced without redesigning all commands.

### Secret Storage

Use this resolution order:

1. environment variables
2. OS keyring
3. restricted local file fallback

Rationale:

- keyring is appropriate for developer machines
- headless Linux environments are too unreliable for keyring-only storage
- agents and CI often need environment-variable-based auth

The config file should store non-secret configuration such as:

- base URL
- active profile
- default output mode

The CLI should support named profiles from the start, for example:

- `default`
- `local`
- `prod`

## Command Design

Use resource-first command groups:

- `tarnished auth`
- `tarnished applications`
- `tarnished job-leads`
- `tarnished profile`
- `tarnished statuses`
- `tarnished dashboard`
- `tarnished analytics`

Write commands should prefer:

- `--body-file <json>`
- `--body '<json>'`

Do not design write flows around a large number of one-off flags unless the operation is trivial.

Read commands should support:

- structured filtering flags
- pagination flags where relevant
- stable JSON output

## Output Contract

The output contract is part of the product surface.

Rules:

- `stdout` contains only the command result
- `stderr` contains progress, warnings, and operator hints
- `--json` output must be stable and predictable
- no truncation or human-only formatting in JSON mode
- no noisy success chatter in JSON mode

This is required for reliable agent use and for future subprocess-level tests.

## Phased Delivery

### Phase 1: Backend Hardening For CLI

Fix only the backend issues that would make the CLI brittle.

Focus:

- audit auth consistency on CLI-facing endpoints
- widen safe endpoints to flexible auth where appropriate
- keep risky or privileged flows strict unless there is a strong reason to change them
- normalize error payloads where agent use would suffer
- identify risky write paths that need explicit safety or future idempotency
- perform small structural cleanup in touched modules if boundaries are obviously poor

Likely focus files:

- `backend/app/core/deps.py`
- `backend/app/api/applications.py`
- `backend/app/api/job_leads.py`
- `backend/app/api/settings.py`
- `backend/app/api/profile.py`
- `backend/app/api/application_history.py`
- `backend/app/api/files.py`
- `backend/app/api/import_router.py`

### Phase 2: CLI Foundation

Build the reusable CLI core.

Scope:

- root Typer app
- global callback state
- config/profile loading
- auth/session storage
- HTTP client with refresh handling
- JSON output/error helpers
- shared input parsing and validation

### Phase 3: Core Resource Commands

Build the first useful agent CLI surface.

Recommended groups:

- `auth`
  - `login`
  - `whoami`
  - `logout`
  - `status`
- `applications`
  - `list`
  - `get`
  - `create`
  - `update`
  - `delete`
  - `sources`
  - `history list`
  - `history delete`
- `job-leads`
  - `list`
  - `get`
  - `create`
  - `retry`
  - `convert`
  - `delete`
  - `sources`
- `profile`
  - `get`
  - `update`
- `statuses`
  - `list`
  - `create`
  - `update`
  - `delete`
- `dashboard`
  - `kpis`
  - `needs-attention`
  - `streak`
- `analytics`
  - `kpis`
  - `heatmap`
  - `weekly`
  - `sankey`
  - `interview-rounds`

### Phase 4: Parity Expansion

Add the remaining web-app-relevant surface:

- `rounds`
- `files`
- `import/export`
- `admin`
- `round-types`
- operational settings surfaces
- AI settings and insights where useful

### Phase 5: Agent Polish

Close the gap between "usable" and "excellent."

Scope:

- stable exit-code contract
- improved structured error taxonomy
- `--dry-run`
- `--yes` enforcement on destructive actions
- polling helpers for long-running operations
- optional idempotency keys on risky create/update flows
- completion/help polish
- compatibility/version checks

## Backend Audit Findings Relevant To This Design

There are no obvious backend flaws severe enough to block all CLI work.

However, there are real debt areas that should be addressed in the CLI-hardening phase:

- auth mode inconsistency across endpoints
- very large API modules that mix concerns:
  - `backend/app/api/job_leads.py`
  - `backend/app/api/applications.py`
  - `backend/app/api/analytics.py`
  - `backend/app/services/extraction.py`

The correct response is not a repo-wide rewrite. The correct response is targeted cleanup where those modules intersect with CLI-critical paths.

## Testing And Verification Strategy

### Backend First

Any backend auth or contract changes needed for the CLI must be covered by backend tests before CLI code depends on them.

### CLI Unit Tests

Use Typer testing utilities for:

- command parsing
- payload validation
- auth/config resolution
- JSON output behavior
- exit-code behavior

### CLI Integration Tests

Run CLI commands against the real FastAPI app in test mode to verify:

- read flows
- write flows
- token refresh behavior
- stdout/stderr separation
- destructive guard behavior

### Later Subprocess Tests

Add shell-level smoke tests for:

- strict JSON on stdout
- exact exit codes
- non-interactive failure without `--yes`

## Anti-Drift Rules

These rules must remain true as the CLI grows:

1. CLI never talks to the database directly.
2. CLI never re-implements frontend business logic as a second source of truth.
3. Backend contracts are the source of truth.
4. CLI tests must fail quickly when backend contracts change incompatibly.
5. If a CLI feature requires awkward client-side compensation for backend inconsistency, fix the backend seam instead.

## Non-Goals

The CLI is not intended to replace browser-extension-only behaviors such as:

- DOM scanning on arbitrary pages
- autofill into arbitrary web forms
- browser-native preview UX

The CLI should target web-app parity, not extension automation parity.

## Recommended First Execution Sequence

1. perform a short backend-hardening sweep on CLI-critical paths
2. build the CLI foundation
3. implement core resource commands
4. expand toward parity in phases

This sequence minimizes technical debt while still moving quickly.
