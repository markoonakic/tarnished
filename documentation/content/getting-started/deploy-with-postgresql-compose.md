---
title: Deploy with PostgreSQL Compose
sidebar_position: 2
description: Run Tarnished with the packaged PostgreSQL Docker Compose install path.
---

Use this guide if you want Tarnished with a local PostgreSQL container instead of the default SQLite-backed install.

It uses:

- `deploy/compose/docker-compose.postgres.yml`
- the published Tarnished image from GitHub Container Registry
- a local PostgreSQL 16 container
- a local `.env` file for the required database password

## Before you begin

You need:

- Docker with the `docker compose` command available
- `curl` to download the install file
- a free local port for the app, `5577` by default

## Quick install

Run this from an empty directory where you want the Tarnished data volumes to live:

```bash
mkdir tarnished && cd tarnished
curl -fsSLO https://raw.githubusercontent.com/markoonakic/tarnished/main/deploy/compose/docker-compose.postgres.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env
docker compose -f docker-compose.postgres.yml up -d
```

Then open `http://localhost:5577` in your browser.

## What this install path does

This Compose file:

- pulls the published Tarnished image by default
- starts a local PostgreSQL container using `postgres:16-alpine`
- stores app files under `./data`
- stores PostgreSQL data under `./postgres_data`
- requires `POSTGRES_PASSWORD` and fails fast if it is missing or blank

:::note
The Tarnished backend supports two PostgreSQL configuration styles internally:

- a full `DATABASE_URL`
- or discrete PostgreSQL settings such as `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`

This install path uses the discrete settings so Docker Compose can wire the app container directly to the local `db` service.
:::

## Verify that the stack is healthy

Check the service state:

```bash
docker compose -f docker-compose.postgres.yml ps
```

You should see both `app` and `db` running.

You can also verify Tarnished directly:

```bash
curl http://localhost:5577/health
```

Expected response:

```json
{"status":"healthy"}
```

## Where your data lives

In this install mode:

- Tarnished uploads and local app data live in `./data`
- PostgreSQL files live in `./postgres_data`

If you want to preserve the deployment, back up both directories.

## Common adjustments

### Change the exposed app port

If port `5577` is already in use:

```bash
APP_PORT=8080 docker compose -f docker-compose.postgres.yml up -d
```

Then open `http://localhost:8080`.

If you want to keep the port setting:

```bash
echo 'APP_PORT=8080' >> .env
```

### Set the public app URL

If Tarnished should generate links for a custom host name or reverse-proxy URL:

```bash
echo 'APP_URL=https://jobs.example.com' >> .env
```

### Pin a specific Tarnished image version

If you do not want to use the default `latest` tag:

```bash
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.1.7 docker compose -f docker-compose.postgres.yml up -d
```

If you want to keep the pin for future runs:

```bash
echo 'TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.1.7' >> .env
```

## Troubleshooting

### The stack fails immediately

Check the logs:

```bash
docker compose -f docker-compose.postgres.yml logs
```

### PostgreSQL does not become healthy

Follow the database logs:

```bash
docker compose -f docker-compose.postgres.yml logs -f db
```

### Tarnished starts but the app is not reachable

Follow the app logs:

```bash
docker compose -f docker-compose.postgres.yml logs -f app
```

The most common causes are:

- `POSTGRES_PASSWORD` is missing or malformed
- the database container is still starting
- the app port is already in use
- the app failed during startup or migrations

## Next steps

- Use [Quickstart with Docker Compose](./quickstart-docker-compose.md) if you want the simpler SQLite-backed path instead.
- Continue into **How-to guides** for operational tasks after the first install.
- Use **Reference** when you need exact configuration details.
