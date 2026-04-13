---
title: Configure AI settings
sidebar_position: 3
description: Configure Tarnished AI settings for extraction and insight features.
---

Use this guide to configure the AI provider settings Tarnished uses for job extraction and pipeline insights.

## Before you begin

You need:

- an admin account in Tarnished
- a supported model/provider combination
- the corresponding provider API key

## Configure AI in the web app

1. Sign in as an admin.
2. Open **Settings**.
3. Open **AI Settings**.
4. Enter:
   - the LiteLLM model string
   - the provider API key
   - an optional custom base URL
5. Save the settings.

## What Tarnished stores

Tarnished stores:

- the model name
- the optional base URL
- the encrypted API key

When the settings are read back, the API key is masked rather than returned in raw form.

## Supported provider model

Tarnished routes AI settings through LiteLLM, which means the app can work with:

- OpenAI
- Anthropic
- Google Gemini
- Azure OpenAI
- compatible self-hosted and proxy providers supported by LiteLLM

## Where the settings are used

The configured AI settings are used by features such as:

- job extraction flows
- analytics insight generation

## Related pages

- [Auth and API keys](../explanation/auth-and-api-keys.md)
- [API overview](../reference/api-overview.md)
