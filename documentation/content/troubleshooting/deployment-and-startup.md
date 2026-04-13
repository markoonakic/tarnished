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

### Check the overall service state

```bash
docker compose -f deploy/compose/docker-compose.yml ps
docker compose -f deploy/compose/docker-compose.postgres.yml ps
```

### Inspect logs

```bash
docker compose -f deploy/compose/docker-compose.yml logs
```

For the PostgreSQL path:

```bash
docker compose -f deploy/compose/docker-compose.postgres.yml logs
docker compose -f deploy/compose/docker-compose.postgres.yml logs -f db
docker compose -f deploy/compose/docker-compose.postgres.yml logs -f app
```

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

For the packaged PostgreSQL Compose install, add it to `.env`:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env
```

### Port conflict

Use a different port:

```bash
APP_PORT=8080 docker compose up -d
```

### Bad PostgreSQL connectivity

Double-check:

- host
- port
- user
- password
- database name

Tarnished prefers `DATABASE_URL` if it is set. Otherwise it builds a PostgreSQL URL internally from the discrete fields.

### Migration failure

Read the app or init-container logs first. Tarnished runs migrations automatically during startup, so migration failures block the app from becoming healthy.

## Related pages

- [Install with Docker Compose](../install/docker-compose.md)
- [Install with PostgreSQL Docker Compose](../install/postgresql-docker-compose.md)
- [Install with Helm](../install/helm.md)
- [Environment variables](../reference/environment-variables.md)
