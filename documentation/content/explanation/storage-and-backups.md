---
title: Storage and backups
sidebar_position: 2
description: Understand where Tarnished stores data and what you need to back up.
---

Tarnished stores two different kinds of state:

- relational application data
- uploaded files and generated artifacts

Understanding where each kind of state lives is necessary for safe backups and migrations.

## SQLite-backed installs

In the default packaged Docker Compose path:

- SQLite data lives under `./data`
- uploaded files live under `./data/uploads`

In practice, this means the local `data/` directory is the critical backup target for the default quickstart path.

## PostgreSQL-backed Compose installs

In the packaged PostgreSQL Compose path:

- Tarnished uploads and local app data live under `./data`
- PostgreSQL database files live under `./postgres_data`

To preserve the full deployment, you must back up both directories.

## Helm and Kubernetes installs

In the Helm chart:

- uploaded files live on the PVC mounted at `/app/data`
- relational application data lives in PostgreSQL when `postgresql.enabled=true`

In this model, the backup surface is:

- the PVC used for Tarnished uploads
- the PostgreSQL database itself

## Upload path model

The backend resolves stored upload paths relative to the configured upload root and rejects paths that try to escape it.

That means Tarnished treats the configured upload root as the canonical file boundary.

## Durable transfer artifacts

ZIP imports and ZIP exports use durable transfer jobs.

That means:

- exports may create generated archive artifacts temporarily
- import and export progress is stored durably in the database
- transfer job cleanup/retention is separate from your core relational and upload storage

## What to back up

### Minimum backup guidance

#### Default SQLite quickstart

Back up:

- `./data`

#### PostgreSQL Compose install

Back up:

- `./data`
- `./postgres_data`

#### Helm / Kubernetes install

Back up:

- the PVC used by Tarnished
- the PostgreSQL database used by Tarnished

## What not to confuse with user data

Do not confuse user data with:

- build artifacts
- downloaded install files
- docs output
- transient container state

The important storage for Tarnished is the app data and the database, not the repository checkout itself.

## Related pages

- [Install with Docker Compose](../install/docker-compose.md)
- [Install with PostgreSQL Docker Compose](../install/postgresql-docker-compose.md)
- [Install with Helm](../install/helm.md)
- [Transfer jobs](./transfer-jobs.md)
