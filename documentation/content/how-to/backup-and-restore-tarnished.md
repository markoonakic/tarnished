---
title: Back up and restore Tarnished
description: Protect Tarnished data for Docker Compose and Helm-based deployments.
---

Use this guide when Tarnished has become important enough that you need a real recovery path, not just an export file.

## Before you begin

You should know which deployment mode you are running:

- Docker Compose with SQLite
- Docker Compose with PostgreSQL
- Helm / Kubernetes

If you are not sure where Tarnished stores data in your deployment mode, read [Storage and backups](../explanation/storage-and-backups.md) first.

## Exports are useful, but not your only backup

Tarnished export files are useful for portability and migration workflows, but they are not the only backup strategy you should rely on.

A real backup plan should also include the underlying storage used by your deployment:

- Tarnished uploads and local app data
- PostgreSQL, when used

## Back up a Docker Compose install (SQLite)

If you used the default Docker Compose install, Tarnished stores its local state under `./data`.

### Safer backup flow

1. Stop the stack so Tarnished is not writing while you copy the files.
2. Copy the `./data` directory to your backup destination.
3. Start Tarnished again.

```bash
docker compose down
cp -R ./data /path/to/your/backup/location/data-backup
docker compose up -d
```

## Back up a Docker Compose install (PostgreSQL)

If you used the PostgreSQL Docker Compose install, back up both:

- `./data`
- `./postgres_data`

### Safer backup flow

1. Stop the stack.
2. Copy both directories.
3. Start Tarnished again.

```bash
docker compose down
cp -R ./data /path/to/your/backup/location/data-backup
cp -R ./postgres_data /path/to/your/backup/location/postgres-backup
docker compose up -d
```

## Back up a Helm / Kubernetes install

For Helm-based installs, Tarnished data is split across:

- the PVC mounted at `/app/data`
- PostgreSQL, when PostgreSQL mode is enabled

The exact backup method depends on your cluster and storage platform, but the important rule is the same: you need backups for both the uploads volume and the PostgreSQL database.

## Restore a Docker Compose install (SQLite)

To restore a SQLite-backed Compose install:

1. Stop Tarnished.
2. Replace the current `./data` directory with the backed-up copy.
3. Start Tarnished again.

```bash
docker compose down
rm -rf ./data
cp -R /path/to/your/backup/location/data-backup ./data
docker compose up -d
```

## Restore a Docker Compose install (PostgreSQL)

To restore a PostgreSQL-backed Compose install:

1. Stop Tarnished.
2. Replace both `./data` and `./postgres_data` with the backed-up copies.
3. Start Tarnished again.

```bash
docker compose down
rm -rf ./data ./postgres_data
cp -R /path/to/your/backup/location/data-backup ./data
cp -R /path/to/your/backup/location/postgres-backup ./postgres_data
docker compose up -d
```

## Restore a Helm / Kubernetes install

For Helm-based installs, restoration happens through your platform backup tools:

- restore the Tarnished PVC contents
- restore the PostgreSQL database
- then bring the Tarnished workload back up

## Verify after restore

After a restore, verify Tarnished responds:

```bash
curl http://localhost:5577/health
```

Then confirm you can:

- sign in
- see application data
- access expected uploaded files

## Related pages

- [Storage and backups](../explanation/storage-and-backups.md)
- [Import and export data](./import-and-export-data.md)
- [Upgrade Tarnished](./upgrade-tarnished.md)
