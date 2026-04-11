---
name: tarnished-cli
description: Use this skill whenever the user wants to operate Tarnished through the CLI, inspect or change applications, job leads, rounds, profile, settings, analytics, import/export, or admin data, or automate Tarnished from an agent. Prefer this skill even for general Tarnished operational requests if the work should happen through the `tarnished` command instead of the browser UI.
---

# Tarnished CLI

Use the Tarnished CLI as the primary interface to Tarnished's server-backed product surface.

The CLI covers the full server-backed Tarnished surface:

- `auth`
- `applications`
- `job-leads`
- `dashboard`
- `analytics`
- `statuses`
- `round-types`
- `rounds`
- `profile`
- `preferences`
- `user-settings`
- `export`
- `import`
- `admin`

The CLI covers server-backed data/actions from the product. It does not reproduce browser-rendered presentation or browser-only behavior such as charts, modals, page navigation, extension popups, or DOM automation.

## Preflight

1. Check the CLI version:
   - `tarnished --version`
2. Check auth state:
   - `tarnished auth status --json`
   - if not authenticated, create/rotate a key in the Tarnished web app, then run:
     - `tarnished auth init --api-key '...'`
     - `tarnished auth doctor --json`
3. If the target environment is ambiguous, prefer explicit targeting:
   - `--profile`
   - `--base-url`

## Operating Defaults

- prefer `--json` for agent use.
- prefer explicit `--profile` when more than one Tarnished environment may exist.
- Prefer explicit `--base-url` when operating against a one-off instance.
- Prefer structured `--body-file` JSON for writes instead of constructing many ad hoc flags.
- Add `--yes` for destructive commands.
- Use only when you need privileged access.
  This applies to `tarnished admin ...`.

## Core Workflows

### Read Data

Use read commands with `--json` whenever the output will be consumed by an agent.

Common starting points:

- Applications:
  - `tarnished applications list --json`
  - `tarnished statuses list --json`
  - use `tarnished statuses list --json` before filtering applications by `status_id`
  - `tarnished applications get <application-id> --json`
- Job leads:
  - `tarnished job-leads list --json`
  - `tarnished job-leads get <job-lead-id> --json`
- Dashboard and analytics:
  - `tarnished dashboard summary --json`
  - `tarnished analytics kpis --period 30d --json`
  - `tarnished analytics weekly --period 30d --json`
  - `tarnished analytics sankey --json`
- Profile and settings:
  - `tarnished auth whoami --json`
  - `tarnished auth doctor --json`
  - `tarnished profile get --json`
  - `tarnished dashboard summary --json`
  - `tarnished user-settings get --json`
  - `tarnished preferences get --json`

If you need exact flags for a command group, use:

- `tarnished <command> --help`

### Write Data

For create and update flows, prefer checked-in or generated JSON body files.

Examples:

- Create an application:
  - `tarnished applications create --body-file create-application.json`
- Extract and create an application from source text or URL:
  - `tarnished applications extract --body-file extract-application.json`
- Create a job lead:
  - `tarnished job-leads create --body-file create-job-lead.json`
- Convert a lead into an application:
  - `tarnished job-leads convert <job-lead-id>`
- Update a profile:
  - `tarnished profile update --body-file profile-update.json`

When changing data, keep commands explicit and avoid relying on interactive behavior.

### Destructive Actions

Destructive commands require deliberate confirmation.

Examples:

- `tarnished applications delete <application-id> --yes`
- `tarnished job-leads delete <job-lead-id> --yes`
- `tarnished admin users delete <user-id> --yes`

Do not omit `--yes` in automated flows.

### Admin Surface

Treat `admin` as privileged.

Use it only when the task genuinely requires administrative access.

Common admin reads:

- `tarnished admin stats --json`
- `tarnished admin users list --json`
- `tarnished admin applications list --json`
- `tarnished admin ai-settings get --json`

Common admin writes:

- `tarnished admin users create --body-file admin-user.json`
- `tarnished admin users update <user-id> --body-file admin-user-update.json`
- `tarnished admin ai-settings update --body-file ai-settings.json`

## Additional Surfaces

The CLI also covers:

- `rounds`
- `round-types`
- application CV / cover-letter flows
- transcript and media upload/download flows
- `export`
- `import`
- API key management via `tarnished auth api-key ...`

Useful operator recipes:

- Signed application document URLs:
  - `tarnished applications cv url <application-id>`
  - `tarnished applications cover-letter url <application-id>`
- Round transcript and media flows:
  - `tarnished rounds transcript upload <round-id> --file-path transcript.txt`
  - `tarnished rounds media upload <round-id> --file-path interview.wav`
  - `tarnished rounds transcript url <round-id>`
  - `tarnished rounds media url <round-id>`
- Import safety:
  - `tarnished import validate <export-file>`
  - `tarnished import run <export-file> --wait`

Use command-group help for exact syntax:

- `tarnished rounds --help`
- `tarnished export --help`
- `tarnished import --help`

## Safety Rules

- Prefer read commands first when you need to inspect state before mutating it.
- Prefer `--json` whenever a downstream agent or tool will parse the output.
- Prefer explicit environment targeting with `--profile` or `--base-url` rather than assuming the default target.
- Do not use `admin` unless the task requires privileged operations.
- Do not describe the CLI as reproducing browser UI behavior; it exposes server-backed data/actions, not browser-rendered presentation.
