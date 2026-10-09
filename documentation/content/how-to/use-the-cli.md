---
title: Use the CLI
sidebar_position: 5
description: Install and authenticate the Tarnished CLI.
---

## Install

```bash
uv tool install tarnished-cli==0.3.6
```

See the [CLI README](https://github.com/markoonakic/tarnished/blob/v0.3.6/cli/README.md)
for source installation and the command reference.

## Authenticate

Create or rotate an API key in the Tarnished web app first, then initialize the CLI locally:

```bash
tarnished auth init --api-key 'your-api-key'
```

Verify the local setup:

```bash
tarnished auth doctor
tarnished auth whoami
```

## Connection and profiles

Configuration is stored in `config.json` under `--config-dir`, then
`TARNISHED_CONFIG_DIR`, then `$XDG_CONFIG_HOME/tarnished` (or
`~/.config/tarnished`). For example:

```json
{
  "default_profile": "work",
  "profiles": {
    "default": { "base_url": "http://127.0.0.1:5577", "output": "json" },
    "work": { "base_url": "https://tarnished.example.com", "output": "json" }
  }
}
```

`--profile` selects a named profile; when omitted, `default_profile` is used.
For that selected profile, the server URL precedence is `--base-url`, then
`TARNISHED_BASE_URL`, then the profile's `base_url`. Output precedence is
`--json`, then `TARNISHED_OUTPUT` (`json` or `text`), then the profile's `output`.
Flags and environment overrides apply only to the current invocation; they do
not rewrite configuration or unrelated profiles. An unknown profile starts with
built-in defaults, so `auth init` can initialize its credentials.

Credentials remain local to the selected profile/config directory. An explicit
`TARNISHED_API_KEY` overrides stored credentials; server-side scopes still apply.
Choose a trusted server when overriding its URL: the CLI uses the selected key
at that server. URL overrides do not migrate or bind credentials to a new origin.

```bash
tarnished --profile work --base-url https://tarnished.example.com auth status
```

The CLI follows bounded same-origin HTTP redirects (same scheme, host and
port), including API trailing-slash redirects. Cross-origin redirects, HTTP/HTTPS
changes, URLs containing user credentials or the configured API key, redirect
loops, and unresolved redirects are unsupported. Configure the **final server
URL** instead. No request or API key is sent to a rejected redirect target; TLS
verification remains enabled. Requests are not automatically retried after failure.

Connection, timeout, TLS, protocol, transfer and invalid JSON responses fail with
exit code `1`, rather than a traceback. With JSON output, errors go to stdout
as JSON (`error`, plus `status_code`/`details` for HTTP errors); text errors go
to stderr. `auth doctor` keeps its diagnostic report and exits `1` when unhealthy.
Successful empty JSON responses remain `null`; binary downloads remain binary
files. Downloads replace the destination only after the full transfer and local
write succeed, so failure or interruption does not overwrite an existing file.

### Waiting for imports

`import run --wait` ends successfully on `complete` and fails promptly on
`failed` or `cancelled`, retaining the server's failure explanation. Both
`--poll-interval` and `--timeout-seconds` must be finite and greater than zero;
invalid values are rejected before starting an import. The monotonic wait timer
starts after submission, sleeps are capped to its remaining time, and polling
requests use at most the remaining time as their HTTPX I/O timeout. This is not
a hard wall-clock cancellation of an in-flight transfer. A local timeout or
interruption does not cancel the server's import; inspect it with `import status`.

## Capture job leads without AI

Save a body file such as `{"url":"https://example.com/job","text":"Optional posting text"}`:

```bash
tarnished --json job-leads save --body-file capture.json
tarnished --json job-leads get "$LEAD_ID"
tarnished --json job-leads edit "$LEAD_ID" --body-file corrections.json
tarnished --json job-leads extract "$LEAD_ID" --expected-revision 1
tarnished --json job-leads retry "$LEAD_ID" --expected-revision 3
tarnished --json job-leads convert "$LEAD_ID"
```

`save` and its existing alias `create` only persist the URL and supplied source;
no page fetch, AI configuration, or provider call is needed. `pending` means
**saved / not extracted**, not queued work. Preserve the returned `id` before any
later step. Duplicate saves return the owner's existing ID in `details.detail.id`.

Input limits are **characters**, not bytes: URL 2,048, text 100,000, optional
legacy HTML 500,000. HTML preprocessing reads at most its first 100,000
characters. The retained, untrusted text snapshot is at most **50,000 characters
including the truncation notice**. Inspect `source_text`, `source_truncated` and
`content_warning`; source previews in the web app are escaped text, not raw HTML.

For edits, `corrections.json` might contain
`{"expected_revision":0,"company":"Example","title":"Engineer","location":null,"skills":[]}`.
Use the current revision returned by GET/save/edit, not the illustrative numbers
above. Omitted fields remain unchanged, null clears scalars, and `[]` clears lists.
Only explicitly supplied business fields become protected manual corrections;
future extraction will not overwrite them. URL, source snapshot, ownership and
processing/conversion state cannot be edited. The server checks merged ranges.
Company and title suffice for conversion without AI; repeated conversion returns
the same application, retaining the initial evidence and time zone.

`extract` and `retry` are explicit provider actions and may cost money. They
require `--expected-revision`; no hidden reads or automatic retries occur. A
processing state can represent an interrupted request, **not durable background
execution**. First inspect the lead. Only if intentionally replacing an uncertain
attempt, add `--restart-processing`; its previous call may still finish or have
been billed, and replacement can repeat paid work.

Extraction/edit/conversion errors retain the known lead `id` in JSON even on a
transport timeout, with the existing `error` and optional HTTP `status_code` /
`details` envelope and exit 1. Inspect the same lead before any retry. A failed
external action does not erase saved source or identity. A 409 needs a reload and
review of current values, never an automatic revision rebase or a new save.

## Preferences and time zone settings

The CLI can inspect or update the same dashboard feature and time zone preferences used by the web app.

Example body file:

```json
{
  "time_zone_mode": "manual",
  "time_zone": "Europe/Belgrade",
  "show_heatmap": true
}
```

Apply it with:

```bash
tarnished preferences update --body-file preferences.json
tarnished preferences get
```

### Device mode behavior

If the stored preference mode is `device`, the CLI uses the local machine time zone as request-time context for the day-sensitive commands that need local-day interpretation.

That means the CLI can mirror the web UI's local-day behavior for surfaces such as:

- streak state
- dashboard KPI windows
- needs-attention buckets
- analytics time windows

The CLI does **not** silently write the machine time zone back into Tarnished just because it can detect it.

## Current command areas

The CLI currently includes command groups for:

- auth
- admin
- applications
- job leads
- profile
- statuses
- round types
- rounds
- user settings
- preferences
- export
- import
- dashboard
- analytics
- reports
- transcriptions

## Important behavior

The CLI is intentionally API-key-first.

It does not manage remote API keys on your behalf. The web app remains the source of truth for API key creation, rotation, and revocation.

## Related pages

- [Configure API keys](./configure-api-keys.md)
- [Auth and API keys](../explanation/auth-and-api-keys.md)

## Recorded evidence and scoped analytics

Status `meaning` is independent of its name. Meanings are `unknown`, `applied`,
`screening`, `interviewing`, `offer`, `accepted`, `rejected`, `withdrawn`,
`no_reply`. The first four non-unknown stages are active; the final four are
closed. No Reply is user-marked closed-unanswered, not every waiting application.
Changing a definition does not rewrite application or history snapshots.

Read an application's `evidence_revision` before corrections. Use its exact
status ID, not a name match: global and personal definitions can share a label
with different meanings. An omitted field stays unchanged; explicit
`response_evidence: null` clears the entire response fact. `{}` records a
substantive response of unknown occurrence date, with server recording time.
A receipt, ordinary status change or round alone does not record a response.

Runnable body files are in `cli/examples/evidence/` in the checkout. These are
synthetic examples, not instructions to modify a real account. Replace the IDs
and example revision `0` with the current owner's actual record/revision. A stale
revision returns 409: reread and reconcile rather than blindly retrying.

```bash
# Read-only evidence and deterministic calculations (no model calls):
tarnished --json applications get "$APP_ID"
tarnished --json applications history list "$APP_ID"
tarnished --json analytics pipeline --period all --as-of 2026-01-07T09:00:00Z
tarnished --json analytics activity --period all --as-of 2026-01-07T09:00:00Z
tarnished --json analytics sankey --period all --as-of 2026-01-07T09:00:00Z

# Explicit owner-scoped corrections; run only with intended write authority:
tarnished applications update "$APP_ID" --body-file cli/examples/evidence/response-record.json
tarnished applications update "$APP_ID" --body-file cli/examples/evidence/response-clear.json
tarnished applications history correct "$APP_ID" "$EVENT_ID" --body-file cli/examples/evidence/history-correction.json
tarnished applications correct-meaning "$APP_ID" --body-file cli/examples/evidence/current-meaning.json
```

Add `status_id` to a response-record body to record an explicit employer outcome
and its transition atomically. Notes and occurrence dates are optional. History
correction changes only the supplied meaning or offset timestamp of one event;
it cannot certify untouched legacy fields or move an event across neighbouring
boundaries. Current-meaning correction does not reconstruct history. History
delete supports `--expected-revision N --yes` and leaves a content-free gap.

`analytics kpis`, `pipeline`, `activity`, `weekly`, `sankey`, `interview-rounds`
and `dashboard kpis` / `needs-attention` accept `--period` and `--as-of`.
Results carry applied-date cohort, timezone, denominator and as-of. Current
classification is separately labelled live/observed-now. Ever interview/offer
counts use distinct applications with evidence, not current counts or round
counts. Visits preserve repeats; unknown intervals and duration coverage remain
explicit. Ten applications with four responses, two ever interviewed and one
ever offered yield 40%, 20%, 10%; zero denominator means unavailable.

Advice is separate: `analytics insights --body-file
cli/examples/evidence/insights.json` is an explicit provider-generation POST,
requiring `analytics:read` **and** `analytics:generate`. Read-only presets do not
gain generation authority. Configure the provider and review its cost before running it. In-session edits invalidate it without
automatic generation; external edits are not continuously monitored.

## Grounded reports (interview, application, pipeline)

Three persisted report scopes are available. Reading a report never contacts a
model provider; requesting one is an explicit generation job that requires the
same authority as generation above (`analytics:generate` plus the read scopes)
and an enabled `openai/` text configuration. Without a configured text model the
request fails with HTTP 503 and no paid call is made.

```bash
# Read the latest stored report per scope (no provider call):
tarnished --json reports interview get "$ROUND_ID"
tarnished --json reports application get "$APP_ID"
tarnished --json reports pipeline get --period 30d

# Request a report explicitly; replace IDs and the example revision with the
# current values from the read above:
tarnished --json reports interview request "$ROUND_ID" --body-file cli/examples/evidence/report-intent.json
tarnished --json reports application request "$APP_ID" --body-file cli/examples/evidence/report-intent.json
tarnished --json reports pipeline request --body-file cli/examples/evidence/report-intent-pipeline.json
```

A report is marked stale when its evidence or configuration changes; re-read it
instead of assuming freshness. Deleting a cited source clears the retained report
content. Pipeline reports use the effective time zone, so pass the same `--as-of`
and time zone to compare them with `analytics pipeline`.

Document text and transcripts are readable and editable from the CLI:

```bash
tarnished --json applications cv text "$APP_ID"
tarnished --json applications cover-letter text "$APP_ID"
tarnished --json applications cv paste-text "$APP_ID" --body-file cli/examples/evidence/document-text.json
tarnished --json rounds transcript get "$ROUND_ID"
tarnished --json rounds transcript paste "$ROUND_ID" --expected-generation 0 --body-file cli/examples/evidence/transcript-paste.json
tarnished --json rounds transcript edit "$ROUND_ID" --expected-generation 1 --body-file cli/examples/evidence/transcript-edit.json
```

Document paste and transcript writes require the `files:write` scope in addition
to the read scopes. Transcript corrections must retain segment IDs, order and
source timestamps; supply the `--expected-generation` you read. A stale value
returns 409: reread and reconcile rather than blindly retrying.

## Speech transcription jobs

Transcription runs on the installation's configured speech service. Starting a
job sends the recording to that service, so it requires `files:write`; status
reads require only `files:read` and `rounds:read`, and reads never dispatch work.

```bash
tarnished --json transcriptions capabilities
tarnished --json transcriptions list "$ROUND_ID"
tarnished --json transcriptions get "$JOB_ID"
tarnished --json transcriptions start "$ROUND_ID" "$MEDIA_ID" --speech-configuration-revision "$REV"
tarnished --json transcriptions retry "$JOB_ID"
```

Read `configuration_revision` from `transcriptions capabilities` and pass it when
starting, so the job is bound to the configuration you reviewed. Every terminal
state is reported honestly (`complete`, `failed`, `interrupted`, `invalidated`),
including the sanitized error. A retry may repeat a request whose outcome is
unknown, so reuse `--intent-id` when repeating an ambiguous attempt.

Report and transcription requests can wait for a bounded time instead of polling
yourself:

```bash
tarnished reports pipeline request --body-file cli/examples/evidence/report-intent-pipeline.json --wait
tarnished transcriptions start "$ROUND_ID" "$MEDIA_ID" --speech-configuration-revision "$REV" --wait
```

`--wait` polls with a finite `--timeout-seconds` (default 300) and a
`--poll-interval` (default 1), and exits non-zero on a terminal failure or
timeout. It never loops forever.
