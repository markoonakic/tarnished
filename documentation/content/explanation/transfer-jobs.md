---
title: Transfer jobs
sidebar_position: 4
description: Understand Tarnished's durable import and export job model.
---

Tarnished uses durable transfer jobs for the heavier import and export workflows.

## Why transfer jobs exist

Some data operations do not finish instantly.

Examples include:

- importing large ZIP archives
- preparing ZIP exports with embedded files

Instead of relying on ephemeral in-memory progress only, Tarnished stores job state durably.

## What a transfer job stores

A transfer job records fields such as:

- job type
- status
- stage
- percent complete
- message
- result payload
- error payload
- source path
- artifact path
- timestamps for creation, updates, and completion

## Current job types

The user-facing heavy paths currently include:

- ZIP export jobs
- import processing jobs

## Job lifecycle

A transfer job typically moves through states like:

- queued
- processing
- complete
- failed

It also tracks a more detailed `stage` field so the client can show useful progress messaging.

## Why this matters for users

Durable transfer jobs improve:

- progress visibility
- safer handling of longer-running operations
- better error reporting
- restart-safe state tracking compared with purely in-memory progress

## Why this matters for contributors

The transfer job model also explains why the import/export API is split between:

- start/create endpoints
- status endpoints
- download endpoints
- cleanup/retention behavior

## Related pages

- [Import and export data](../how-to/import-and-export-data.md)
- [API overview](../reference/api-overview.md)
- [Storage and backups](./storage-and-backups.md)
