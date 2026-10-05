---
title: Install with PostgreSQL Docker Compose
description: Install Tarnished 0.2.4 with a PostgreSQL 16 service.
---

Use this instead of the SQLite Compose file when you want a separate database.
You need Docker with Compose v2 and `curl`. Tarnished runs one application process.

## Install

```bash
mkdir tarnished && cd tarnished
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/markoonakic/tarnished/v0.2.4/deploy/compose/docker-compose.postgres.yml
```

Create `.env` with a strong database password. Protect the file with `chmod 600 .env`.
Do not overwrite a password from an existing installation.

```dotenv
POSTGRES_PASSWORD=replace-with-a-long-random-password
APP_PORT=127.0.0.1:5577
APP_URL=http://localhost:5577
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.2.4
```

```bash
docker compose up -d --wait
```

Open **http://localhost:5577** and create the first admin account in the browser.
You are signed in automatically. Later accounts are created in **Admin → Users**. See
[account setup](../get-started/create-admin-account.md).

The init service prepares application storage. The app waits for PostgreSQL to
be healthy and runs migrations before serving requests. PostgreSQL has no
published host port.

## Storage and operations

- `./data` contains uploads and the signing secret.
- `./postgres_data` contains the PostgreSQL database.
- `.env` contains the database password and deployment options.

Preserve all three. Use a PostgreSQL dump rather than copying a running database's
files. See [backup and restore](../how-to/backup-and-restore-tarnished.md).

```bash
docker compose ps
docker compose logs --tail=100 app db
curl -fsS http://localhost:5577/health
```

Use HTTPS for remote access. Configure optional text and speech services in
Admin. For other runtime settings, see [environment variables](../reference/environment-variables.md).
