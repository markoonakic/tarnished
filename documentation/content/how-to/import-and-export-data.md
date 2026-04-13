---
title: Import and export data
sidebar_position: 4
description: Use Tarnished import and export features for backup and migration workflows.
---

Use this guide when you want to move Tarnished data in or out of the system.

## Available export formats

Tarnished supports:

- JSON export
- CSV export
- ZIP export jobs for file-backed export bundles

## Available import path

Tarnished supports ZIP-based import workflows that validate the archive before import processing begins.

## What to expect from ZIP export

ZIP export is treated as a durable job rather than an instant response.

That means Tarnished:

- creates an export job
- prepares the ZIP archive in the background
- makes the download available when the job reaches the complete state

## What to expect from import

Import follows a similar durable-job pattern:

- upload and validate the archive
- inspect the payload format
- process the import in the background
- report durable job status and progress

## Why this matters

The durable-job model is designed for:

- better progress visibility
- safer handling of longer operations
- improved recovery compared with in-memory-only progress tracking

## Backup guidance

An export file is useful, but it is not the only backup strategy you should rely on.

You should also back up the underlying application storage described in [Storage and backups](../explanation/storage-and-backups.md).

## Related pages

- [Transfer jobs](../explanation/transfer-jobs.md)
- [Storage and backups](../explanation/storage-and-backups.md)
- [Troubleshooting](../troubleshooting/index.md)
