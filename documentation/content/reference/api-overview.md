---
title: API overview
sidebar_position: 2
description: High-level reference to Tarnished backend API surfaces and authentication expectations.
---

Tarnished exposes a FastAPI backend that serves both the web app and machine clients.

## Core API areas

The current backend includes routes for:

- authentication
- applications
- application history
- profile
- rounds
- settings and API keys
- analytics and dashboard data
- admin functions
- imports and exports
- job leads
- files and signed file URLs
- user preferences and streaks
- AI settings and insights
- user management

## Authentication modes

The API supports two primary auth modes:

- **JWT-backed browser sessions** for the web app
- **API keys** for machine clients such as the CLI and browser extension

The `/api/auth/whoami` endpoint can identify whether the current caller is authenticated with:

- `jwt`
- `api_key`

## OpenAPI and built-in docs

The backend is a FastAPI application, so it exposes:

- an OpenAPI schema at `/openapi.json`
- Swagger UI at `/docs`
- ReDoc at `/redoc`

These built-in docs are the raw API reference source of truth.

## Preferences and day-boundary behavior

The user-preferences surface includes:

- dashboard feature visibility
- time zone mode (`device` or `manual`)
- manual time zone override

Day-based surfaces such as streaks, dashboard KPI windows, follow-up buckets, and analytics period windows use the caller's effective local day rather than a hard-coded server-local date.

For callers using `device` mode, date-sensitive routes accept request-time timezone context so the backend can interpret the caller's local day correctly. Manual mode uses the stored timezone override instead.

### Application dates and round times

`applied_at` is a calendar date (`YYYY-MM-DD`), not a timestamp. Explicit dates
are preserved. Omit it on application creation/extraction to use the effective
local date; the web app, CLI and extension send a `Time-Zone` IANA zone header.
A manual user preference takes precedence over that header.

Round `scheduled_at` and `completed_at` writes are normalized to UTC. An explicit
offset identifies the instant; a timestamp without an offset uses the effective
user zone. Without a known zone, supply a `Time-Zone` header or an explicit offset.
Nonexistent daylight-saving wall times return 422. A newly edited ambiguous wall
time selects the first occurrence; use an explicit offset for the second one.
Round creation/update clients editing wall times may send
`Expected-Round-Time-Zone` with the effective IANA zone displayed during editing.
If a naive, non-null date is submitted and that zone no longer matches the server's
effective zone, the whole mutation returns `409` before saving any fields. Refetch
preferences and confirm/reload dates before retrying. This precondition does not
change the device `Time-Zone` header or manual-preference precedence; explicit
offsets, omitted dates and `null` clears do not depend on it. The web round form
uses this precondition to detect changes made in another tab or by an API client.

Omit unchanged round dates to preserve their exact instant, including seconds;
send `null` to clear them. SQLite round responses mark stored naive values as UTC.
Legacy round values without timezone provenance cannot be reconstructed reliably;
there is no bulk historical reinterpretation or change to other timestamp fields.

## Common route groups

### Auth

- `/api/auth/login`
- `/api/auth/refresh`
- `/api/auth/me`
- `/api/auth/whoami`
- `/api/auth/setup-status` (read-only; no HTTP bootstrap)
- `POST /api/auth/change-password` (`current_password`, `new_password`; JWT only)
- `POST /api/auth/signout-all` (JWT only)

There is no `/api/auth/register` route. Use host-only owner setup then
`POST /api/admin/users` for administrator-managed enrollment. Admin routes require
both current admin role and matching scopes for API keys. No
`/api/admin/applications` browsing route exists. Password changes/resets invalidate
old access/refresh tokens and signed links; API keys remain unless revoked.
See [account lifecycle and recovery](../get-started/create-admin-account.md).

### Applications and job leads

- `/api/applications`
- `/api/applications/extract`
- `/api/job-leads`
- `/api/job-leads/{id}/convert`

### Files

- `/api/files/...`

This group includes:

- signed URLs
- application document access
- round transcript access
- media access

### Import and export

- `/api/export/json`
- `/api/export/csv`
- `/api/export/zip-jobs`
- `/api/import/...`

The heavier ZIP import/export paths use durable transfer jobs.

## Machine-client expectations

### CLI

The CLI is API-key-first and expects an API key with the scopes required by the selected commands.

### Browser extension

The extension also uses API-key auth and calls endpoints for:

- job leads
- applications
- statuses
- profile

## Related pages

- [Auth and API keys](../explanation/auth-and-api-keys.md)
- [Import and export data](../how-to/import-and-export-data.md)
- [Configure API keys](../how-to/configure-api-keys.md)
- [Use the CLI](../how-to/use-the-cli.md)
- [Use the browser extension](../how-to/use-the-browser-extension.md)

## Recorded evidence and calculations

- `POST /api/statuses`, `PATCH /api/statuses/{id}` accept stable `meaning`.
  Applications retain `status_meaning` / provenance independently of the current
  definition. History retains from/to meanings, individual provenance,
  correction metadata and content-free `is_gap` boundaries.
- Application create/update accept `response_evidence: {occurred_on?, reference?}`.
  An explicit empty object records an undated substantive fact; omission preserves
  it, null clears it. Neither arbitrary status transitions nor round creation
  imply a response. Update accepts optimistic `expected_revision`.
- `PATCH /api/applications/{id}/meaning` takes `meaning, expected_revision` for a
  current-only correction. `PATCH /api/applications/{id}/history/{event_id}` takes
  `expected_revision` and supplied `from_meaning`, `to_meaning` or offset
  `changed_at`; optional `correction_note` is not an attestation requirement.
  Untouched legacy fields remain unknown. Deletion retains an evidence boundary.
- `GET /api/analytics/{pipeline,kpis,sankey,activity,weekly,interview-rounds}`
  accepts `period=7d|30d|3m|all` and optional offset `as_of`. Pipeline/KPIs expose
  cohort/as-of/denominator, response unknowns, current-versus-ever counts, real
  visits, totals and coverage. Current classification has its own observed-at
  basis and is not historical reconstruction. Round activity uses its own dates;
  scheduled-to-completed duration is not time in application stage or response
  speed. Sankey node identity is event ID, never label text.
- `POST /api/analytics/insights` remains explicit generation, not a cache read.
  It uses corrected deterministic inputs and requires `analytics:generate` as
  well as analytics read/input authorization. No read or web query invalidation
  generates advice.
- Persisted grounded feedback is available at three scopes, each an explicit
  request, never a read-triggered provider call:
  - `GET|POST /api/rounds/{round_id}/interview-feedback` for interview feedback;
  - `GET|POST /api/applications/{application_id}/feedback` for one application;
  - `GET|POST /api/analytics/feedback` for the whole pipeline (accepts
    `period=7d|30d|3m|all` and optional offset `as_of`).
  Requests require `analytics:generate` plus the read scopes; reads require the
  read scopes only. A stored report carries its scope, run time, provider/model,
  configuration revision, source fingerprint, cited passages and coverage.
  Relevant source changes mark the latest report per scope stale; deletion of a
  source clears dependent report content and asks for an explicit rerun. There is
  no report history and no automatic rerun. Pipeline reports quote the
  deterministic metrics computed by the application and must not recalculate
  them. A configured text model is not a claim of verified model quality.

See [CLI evidence examples](../how-to/use-the-cli.md#recorded-evidence-and-scoped-analytics)
for executable body-file contracts. Personal archive evidence fields are supported
by the versioned archive format. Use matching client and server versions when
moving records between installations.
