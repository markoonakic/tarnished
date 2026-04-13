---
title: Install with Docker Compose
description: Run Tarnished with the default SQLite-backed Docker Compose install.
---

Use this install method if you want:

- the fastest way to self-host Tarnished
- a single Docker Compose file
- the default SQLite-backed app mode

## Before you begin

You need:

- Docker Engine with the `docker compose` command available
- a free local port for Tarnished, `5577` by default
- `curl` or another way to save the compose file locally

## Quick install

Create a directory for Tarnished, download the compose file, and start the stack:

```bash
mkdir tarnished
cd tarnished
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/markoonakic/tarnished/main/deploy/compose/docker-compose.yml
docker compose up -d
```

## The compose file used in this guide

Save this as `docker-compose.yml`:

```yaml
services:
  app:
    image: ${TARNISHED_IMAGE:-ghcr.io/markoonakic/tarnished:latest}
    ports:
      - "${APP_PORT:-5577}:5577"
    volumes:
      - ./data:/app/data
    environment:
      - APP_URL=${APP_URL:-http://localhost:5577}
    restart: unless-stopped
```

## Optional `.env` file

You do not need a `.env` file for the default install. If you want to override the default port, public URL, or image tag, create `.env` next to `docker-compose.yml`:

```env
# Optional overrides
# TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.1.7
APP_PORT=5577
APP_URL=http://localhost:5577
```

## Verify the install

Check that the container is running:

```bash
docker compose ps
```

Then confirm the health endpoint responds:

```bash
curl http://localhost:5577/health
```

Expected response:

```json
{"status":"healthy"}
```

## Open Tarnished

Open Tarnished in your browser:

```text
http://localhost:5577
```

The first account created in a fresh Tarnished instance becomes the administrator.

## Where your data lives

In this install mode:

- SQLite data is stored under `./data`
- uploaded files are stored under `./data/uploads`

Back up `./data` if you want to preserve the instance.

## Common adjustments

### Change the exposed port

```bash
APP_PORT=8080 docker compose up -d
```

Then open `http://localhost:8080`.

### Pin a specific Tarnished version

```bash
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.1.7 docker compose up -d
```

## Troubleshooting

If Tarnished does not start or does not become healthy:

```bash
docker compose logs app
docker compose logs -f app
```

Then continue with [Deployment and startup problems](../troubleshooting/deployment-and-startup.md).

## Next step

Continue with [Create your admin account](../get-started/create-admin-account.md).
