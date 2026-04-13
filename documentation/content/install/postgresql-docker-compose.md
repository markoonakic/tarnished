---
title: Install with PostgreSQL Docker Compose
description: Run Tarnished with Docker Compose and a local PostgreSQL container.
---

Use this install method if you want:

- PostgreSQL from the start
- separate app and database storage directories
- a Docker Compose setup that is still easy to run locally

## Before you begin

You need:

- Docker Engine with the `docker compose` command available
- a free local port for Tarnished, `5577` by default
- `curl` or another way to save the compose file locally
- a strong PostgreSQL password for the `.env` file

## Quick install

Create a directory for Tarnished, download the PostgreSQL compose file as `docker-compose.yml`, create `.env`, and start the stack:

```bash
mkdir tarnished
cd tarnished
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/markoonakic/tarnished/main/deploy/compose/docker-compose.postgres.yml
cat > .env <<'EOF'
POSTGRES_PASSWORD=replace-with-a-strong-password
APP_PORT=5577
APP_URL=http://localhost:5577
EOF
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
      - POSTGRES_HOST=db
      - POSTGRES_PORT=5432
      - POSTGRES_USER=tarnished
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
      - POSTGRES_DB=tarnished
      - APP_URL=${APP_URL:-http://localhost:5577}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    volumes:
      - ./postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=tarnished
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
      - POSTGRES_DB=tarnished
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      start_period: 10s
      retries: 5
    restart: unless-stopped
```

## The `.env` file used in this guide

Save this as `.env` next to `docker-compose.yml`:

```env
POSTGRES_PASSWORD=replace-with-a-strong-password
APP_PORT=5577
APP_URL=http://localhost:5577
```

## Verify the install

Check that both services are running:

```bash
docker compose ps
```

Then confirm Tarnished responds:

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

- Tarnished app data and uploaded files are stored under `./data`
- PostgreSQL data is stored under `./postgres_data`

Back up both directories if you want to preserve the instance.

## Common adjustments

### Change the exposed port

Update `.env` and restart the stack:

```env
APP_PORT=8080
APP_URL=http://localhost:8080
```

### Pin a specific Tarnished version

Add this to `.env`:

```env
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.1.7
```

## Troubleshooting

If the stack does not come up cleanly:

```bash
docker compose logs app
docker compose logs db
docker compose logs -f db
```

Then continue with [Deployment and startup problems](../troubleshooting/deployment-and-startup.md).

## Next step

Continue with [Create your admin account](../get-started/create-admin-account.md).
