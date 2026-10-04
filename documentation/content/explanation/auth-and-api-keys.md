---
title: Auth and API keys
sidebar_position: 3
description: Understand Tarnished authentication modes and API key scope design.
---

This page describes authentication in Tarnished 0.2.2. See
[account setup](../get-started/create-admin-account.md) for owner setup and recovery.

Tarnished uses two different authentication styles depending on the client.

## Browser sessions

The web app uses JWT-backed browser sessions for interactive user authentication.

These routes live under `/api/auth` and include:

- login
- refresh
- current-user identity
- JWT-only password change and all-session signout

Account creation is administrator-managed after [browser first-run setup](../get-started/create-admin-account.md). That guide documents recovery, legacy-token invalidation and the independent API-key lifecycle. Ordinary browser logout only clears local tokens.

## API keys for machine clients

Machine clients use API keys.

This is the intended model for:

- the Tarnished CLI
- the browser extension
- other automation clients

The API key model is scope-based rather than all-or-nothing.

## Preset scope sets

The backend currently defines these preset families:

- full access
- CLI
- extension
- read only
- import/export
- custom

### Why presets exist

Presets reduce the chance that users create a key with either:

- too much access
- not enough access for the target client

## CLI auth model

The CLI is intentionally API-key-first.

The CLI does not:

- create remote API keys
- rotate remote API keys
- restore old JWT login flows for machine use

Instead, the web app remains the source of truth for API key lifecycle, and the CLI validates and stores a user-created API key locally.

## Extension auth model

The extension also uses API keys.

That lets it access only the endpoints it needs, such as:

- job leads
- applications
- statuses
- profile

## `whoami` for flexible identity checks

The `/api/auth/whoami` endpoint exists so clients can confirm:

- who the current caller is
- whether auth is via `jwt` or `api_key`
- which API key record is currently in use, when applicable

## Structured archive scopes

Structured JSON/ZIP exports can include retained document text, profile evidence and latest interview feedback. API keys need **all three** scopes: `export:read`, `files:read`, and `profile:read`. These checks apply to direct exports and ZIP-job creation, status/results and downloads, including artifacts created before a scope was removed. A missing scope returns an actionable `403`; revoked keys cannot retrieve existing artifacts.

CSV reporting retains its existing `export:read` requirement. JWT web sessions are unchanged. Existing keys and presets are **not** silently expanded: a legacy import/export preset may now receive `403` for structured archives. Use an explicitly configured key with the required scopes.

## Admin-only AI settings

Some settings, such as the AI configuration, are restricted further:

- admin user requirement
- matching admin read/write API scopes for API-key access

## Related pages

- [API overview](../reference/api-overview.md)
- [Configure API keys](../how-to/configure-api-keys.md)
- [Configure AI settings](../how-to/configure-ai-settings.md)
- [Use the CLI](../how-to/use-the-cli.md)
- [Use the browser extension](../how-to/use-the-browser-extension.md)
