---
title: Auth and API keys
sidebar_position: 3
description: Understand Tarnished authentication modes and API key scope design.
---

Tarnished uses two different authentication styles depending on the client.

## Browser sessions

The web app uses JWT-backed browser sessions for interactive user authentication.

These routes live under `/api/auth` and include:

- registration
- login
- refresh
- current-user identity

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
