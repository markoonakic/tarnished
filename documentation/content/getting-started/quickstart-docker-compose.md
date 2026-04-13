---
title: Quickstart with Docker Compose
sidebar_position: 1
description: Get Tarnished running locally with the default Docker Compose setup.
---

This tutorial gets Tarnished running locally with the default Docker Compose setup.

It uses:

- the root `docker-compose.yml` file
- the default SQLite-backed app mode
- the local app build from this repository

## Before you begin

You need:

- Docker with the `docker compose` command available
- a free local port for the app, `5577` by default
- this repository cloned locally

You do **not** need a `.env` file for the default SQLite quickstart.

## Step 1: Start Tarnished

From the repository root, run:

```bash
git clone https://github.com/markoonakic/tarnished.git
cd tarnished
docker compose up -d
```

The default Compose file builds the app image locally, starts the app container, and mounts `./data` into the container for persistent app data.

:::tip What happens on first startup?
On startup, the container entrypoint creates the uploads directory, generates a persistent `SECRET_KEY` if one does not already exist, runs database migrations, and then starts the FastAPI server on port `5577`.
:::

## Step 2: Verify that the container is healthy

Check the container status:

```bash
docker compose ps
```

You should see the `app` service running.

You can also verify the health endpoint directly:

```bash
curl http://localhost:5577/health
```

Expected response:

```json
{"status":"healthy"}
```

## Step 3: Open Tarnished

Open Tarnished in your browser:

```text
http://localhost:5577
```

The first account you create becomes the administrator automatically.

## Step 4: Understand where your data lives

In the default SQLite quickstart:

- application data is stored under `./data`
- uploaded files are stored under `./data/uploads`
- the app uses SQLite by default when PostgreSQL settings are not configured

Back up `./data` if you want to preserve the local quickstart instance.

## Common local adjustments

### Change the exposed port

If port `5577` is already in use, set `APP_PORT` before starting the stack:

```bash
APP_PORT=8080 docker compose up -d
```

Then open Tarnished at `http://localhost:8080`.

### Rebuild after local changes

If you change the app code and want to rebuild the image:

```bash
docker compose up -d --build
```

## Troubleshooting

### The app does not start

Check the container logs:

```bash
docker compose logs app
```

### The health check fails

Follow the startup logs live:

```bash
docker compose logs -f app
```

The most common causes are:

- the first image build is still running
- a local port conflict
- a startup failure during migrations

## Next steps

- Continue in **Getting started** for the next Tarnished basics.
- Use **How-to guides** when you need a specific deployment or operational task.
- Use **Reference** for exact environment and deployment details.
