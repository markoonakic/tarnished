# Tarnished Docker Compose install files

This directory contains the user-facing Docker Compose install files for Tarnished.

## Files

- `docker-compose.yml` — default SQLite-backed install
- `docker-compose.postgres.yml` — local PostgreSQL-backed install
- `.env.example` — optional environment overrides for Compose installs

## Install model

These Compose files are intended to pull the published Tarnished image from GitHub Container Registry by default.

The default image is pinned to `0.3.0` and the port binds to localhost. Override
`TARNISHED_IMAGE`, `APP_PORT` and `APP_URL` in `.env` as needed. Start with
`docker compose up -d`; see the [quick start](../../README.md#quick-start) for
account setup. Local speech is optional; see [LOCAL-SPEECH.md](LOCAL-SPEECH.md).
