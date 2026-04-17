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

## Common route groups

### Auth

- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/refresh`
- `/api/auth/me`
- `/api/auth/whoami`
- `/api/auth/setup-status`

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
