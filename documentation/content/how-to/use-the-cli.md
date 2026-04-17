---
title: Use the CLI
sidebar_position: 5
description: Install and authenticate the Tarnished CLI.
---

Use this guide to install and authenticate the Tarnished CLI.

## Install the CLI

Recommended path:

```bash
uv tool install tarnished-cli
```

Homebrew convenience path:

```bash
brew tap markoonakic/tap
brew install tarnished-cli
```

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

## Important behavior

The CLI is intentionally API-key-first.

It does not manage remote API keys on your behalf. The web app remains the source of truth for API key creation, rotation, and revocation.

## Related pages

- [Configure API keys](./configure-api-keys.md)
- [Auth and API keys](../explanation/auth-and-api-keys.md)
