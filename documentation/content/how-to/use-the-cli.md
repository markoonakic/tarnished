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
