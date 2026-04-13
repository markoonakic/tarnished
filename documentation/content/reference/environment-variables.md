---
title: Environment variables
sidebar_position: 1
description: Reference for Tarnished environment variables and their deployment impact.
---

This page lists the main environment variables that influence Tarnished runtime behavior.

## Common install-time variables

### `TARNISHED_IMAGE`

Used by the Docker Compose install files to override the published Tarnished image tag.

Example:

```bash
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.1.7 docker compose up -d
```

### `APP_PORT`

Controls the external port published by the Docker Compose install files.

Default:

```text
5577
```

### `APP_URL`

Controls the public base URL of the instance.

This affects:

- generated links
- CORS allowlist handling
- trusted host handling
- reverse-proxy installs

Default:

```text
http://localhost:5577
```

### `POSTGRES_PASSWORD`

Required for the packaged PostgreSQL Docker Compose install.

The PostgreSQL Compose file fails fast if this value is missing or blank.

## Backend runtime variables

The backend settings layer supports both a full database URL and a discrete PostgreSQL configuration.

### Database selection

Priority order:

1. `DATABASE_URL`
2. discrete PostgreSQL settings
3. SQLite fallback

### `DATABASE_URL`

Full database URL. Takes precedence over the discrete PostgreSQL fields.

Example:

```text
postgresql+asyncpg://user:pass@host:5432/db
```

### Discrete PostgreSQL variables

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

When all required discrete values are present, Tarnished builds the database URL internally and handles password encoding safely.

### `SQLITE_PATH`

Internal SQLite fallback path when PostgreSQL is not configured.

Default:

```text
./data/app.db
```

### `SECRET_KEY`

JWT signing key.

If `SECRET_KEY` is not provided in the packaged Docker Compose SQLite path, the container entrypoint generates a persistent secret on first startup and stores it under the app data directory.

For production-style installs, provide this value explicitly or reference an existing Kubernetes secret.

### `UPLOAD_DIR`

Filesystem directory used for stored uploads.

Default:

```text
./uploads
```

Packaged container installs set this to:

```text
/app/data/uploads
```

### `TRUSTED_HOSTS`

Additional comma-separated hostnames accepted by `TrustedHostMiddleware`.

Tarnished also includes built-in defaults such as:

- `localhost`
- `127.0.0.1`
- `test`
- the host derived from `APP_URL`

### `CORS_ORIGINS`

Comma-separated CORS allowlist.

Default development value includes local frontend origins.

### Other backend settings

The backend settings layer also includes:

- `ADMIN_EMAIL`
- `MAX_DOCUMENT_SIZE_MB`
- `MAX_MEDIA_SIZE_MB`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`

These are application runtime settings rather than packaged install entry points.

## Where to set values

### Docker Compose installs

Set values:

- inline in the shell for one-off runs
- or in `.env` next to the downloaded compose file

### Helm installs

Set values through:

- `values.yaml`
- `--set`
- Kubernetes `Secret` references

For PostgreSQL-backed Helm installs, the recommended path is an existing secret rather than inline shell secrets.

## Related pages

- [Install with Docker Compose](../install/docker-compose.md)
- [Install with PostgreSQL Docker Compose](../install/postgresql-docker-compose.md)
- [Install with Helm](../install/helm.md)
- [Storage and backups](../explanation/storage-and-backups.md)
