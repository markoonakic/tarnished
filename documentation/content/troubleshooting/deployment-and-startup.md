---
title: Deployment and startup problems
sidebar_position: 1
description: Diagnose common Tarnished deployment and startup failures.
---

Use this page when Tarnished does not start, does not become healthy, or does not become reachable after deployment.

## Symptoms

Common symptoms include:

- the container or pod exits immediately
- the app health check never turns healthy
- the app port is not reachable
- the migration/init step fails
- the database dependency never becomes ready

## Common causes

The most common causes are:

- missing required environment variables
- port conflicts
- database startup failures
- failed migrations during startup
- invalid PostgreSQL settings
- storage or volume problems

## Checks for Docker Compose installs

Run these commands from the install directory. Both install guides save the
configuration as `docker-compose.yml`. If you kept a different filename, add
`-f <filename>` after `docker compose` in each command.

### Check the overall service state

```bash
docker compose ps
```

### Inspect logs

```bash
docker compose logs --tail=100 app
```

For the PostgreSQL path:

```bash
docker compose logs --tail=100 db
```

Use `docker compose logs -f app` to follow startup. Redact credentials and private
content before sharing logs.

### Verify the app health endpoint

```bash
curl http://localhost:5577/health
```

## Checks for Helm installs

### Check the Helm release

```bash
helm status -n tarnished tarnished
```

### Watch pods

```bash
kubectl get pods -n tarnished -w
```

### Inspect app logs

```bash
kubectl logs -n tarnished deploy/tarnished
```

### Inspect init-container logs

```bash
kubectl logs -n tarnished deploy/tarnished -c migrate
```

## Fixes

### Missing `POSTGRES_PASSWORD`

Edit the existing `.env` and set the missing `POSTGRES_PASSWORD`. Preserve the
other settings. If the database already exists, restore its configured password
from protected configuration or a backup. Do not replace it with a new random
password: changing `.env` does not change the password inside PostgreSQL.

### Port conflict

Edit `APP_PORT` and `APP_URL` together in `.env`, then run `docker compose up -d`.
For local-only access, use `APP_PORT=127.0.0.1:8080` and
`APP_URL=http://localhost:8080`. If `APP_URL` names an HTTPS proxy, keep that public
URL instead.

### Bad PostgreSQL connectivity

Double-check:

- host
- port
- user
- password
- database name

Tarnished prefers `DATABASE_URL` if it is set. Otherwise it builds a PostgreSQL URL internally from the discrete fields.

### Permission denied under `/app/data`

The image runs as UID/GID `1000:1000`. The Compose init service prepares storage
ownership before startup; keep the complete file. For existing data, stop the
app, take a backup and inspect ownership before changing it. Do not use
`chmod 777` or delete the data directory.

### Owner command is unavailable

Owner commands require Tarnished 0.2.0 or newer. Check your image version and
follow [account setup](../get-started/create-admin-account.md).

### Invalid host or origin

Set `APP_URL` to the URL used in the browser. If additional hosts are needed,
pass `TRUSTED_HOSTS` explicitly to the app container. Compose's `.env` is used for
interpolation; it does not automatically forward every backend variable.

### Migration failure

Read the app or init-container logs first. Migrations run during startup, so a
failure can prevent the app from becoming healthy. Do not remove the database,
secret, or migration records to force startup. Keep a backup before recovery.
For Helm, check storage permissions and any configured signing Secret using the
[Helm guide](../install/helm.md).

## Related pages

- [Install with Docker Compose](../install/docker-compose.md)
- [Install with PostgreSQL Docker Compose](../install/postgresql-docker-compose.md)
- [Install with Helm](../install/helm.md)
- [Environment variables](../reference/environment-variables.md)
