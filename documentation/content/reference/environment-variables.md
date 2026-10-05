---
title: Environment variables
sidebar_position: 1
description: Reference for Tarnished environment variables and their deployment impact.
---

This page separates Compose-file inputs from variables passed to the backend.
The install guides target Tarnished 0.2.4.

## Common install-time variables

### `TARNISHED_IMAGE`

Used by the Docker Compose install files to override the published Tarnished image tag.

Example:

```bash
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.2.4 docker compose up -d
```

### `APP_PORT`

Controls the host-side binding published by the Docker Compose install files.
The application still listens on container port `5577`. Use `127.0.0.1:5577` for
local-only access. A bare port publishes on all host interfaces.

Compose-file default:

```text
127.0.0.1:5577
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

JWT signing, API-key hashing and shared credential encryption secret. Preserve it
with instance backups; personal exports do not contain it. Operator recovery
requires the existing secret and does not generate a replacement.

For Compose, the container entrypoint generates `/app/data/.secret_key` on first
startup if no explicit secret or saved file exists. This applies to both database
modes. Keep the file across restarts and restores.

Helm uses the same entrypoint in its migration container. You can also provide
the key through `secretKey.existingSecret`.

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

### `LITELLM_LOCAL_MODEL_COST_MAP`

The container sets this to `true` to use LiteLLM's bundled model metadata instead
of fetching it during startup. Optional provider requests still work normally.
Set it in a source installation when startup must not fetch remote metadata.

### Other backend settings

The backend settings layer also includes:

- `MAX_DOCUMENT_SIZE_MB`
- `MAX_MEDIA_SIZE_MB`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`

These are application runtime settings rather than packaged install entry points.

## Where to set values

### Docker Compose installs

Compose reads `.env` next to the downloaded file for **interpolation**, not as an
automatic container environment. Shell values take precedence over `.env`.

The SQLite file references `TARNISHED_IMAGE`, `APP_PORT` and `APP_URL`.
The PostgreSQL file also references `POSTGRES_PASSWORD` and maps its database host,
port, user and database name. Edit `.env` without overwriting its other settings.

For other backend variables, add explicit `environment` mappings in a local
Compose override or use a dedicated container `env_file`. Do not assume that
adding `DATABASE_URL`, `SECRET_KEY` or `TRUSTED_HOSTS` to `.env` alone passes it to
the app. Keep secret-bearing overrides out of version control.

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
- [Architecture overview](../explanation/architecture-overview.md)
