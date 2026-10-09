---
title: Install with Docker Compose
description: Install Tarnished 0.3.6 with SQLite and persistent local storage.
---

Docker Compose with SQLite is the simplest installation. You need Docker Engine
or Docker Desktop with Compose v2, `curl` and a free local port `5577`.

## Start Tarnished

Run in a new directory:

```bash
mkdir tarnished && cd tarnished
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/markoonakic/tarnished/v0.3.6/deploy/compose/docker-compose.yml
docker compose up -d --wait
```

The file uses `ghcr.io/markoonakic/tarnished:0.3.6`. Its init service prepares
`./data` for the non-root application. No separate permission command is needed.
Open **http://localhost:5577** and create the first admin account in the browser.
Enter your email, password and password confirmation. You are signed in
automatically. See [account setup](../get-started/create-admin-account.md) for
password rules and recovery. Later accounts are created in Admin; public
registration is disabled after setup.
AI is not required to use Tarnished.

## Configuration

The default binding is `127.0.0.1:5577`. Create a `.env` file to override it:

```dotenv
APP_PORT=127.0.0.1:5577
APP_URL=http://localhost:5577
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.3.6
```

For remote access, set the browser-facing `APP_URL`, configure an HTTPS proxy,
and change `APP_PORT` only as needed. Compose's `.env` is used for interpolation;
other backend variables require explicit container environment mappings. See
[environment variables](../reference/environment-variables.md).

## Verify and maintain

```bash
docker compose ps
docker compose logs --tail=100 app
curl -fsS http://localhost:5577/health
```

The health endpoint returns `{"status":"healthy"}`. `./data` contains SQLite,
uploads and `.secret_key`. Keep it when restarting or upgrading. `docker compose
down` stops the installation without removing that directory.

Read [backup and restore](../how-to/backup-and-restore-tarnished.md) before an
[upgrade](../how-to/upgrade-tarnished.md). For startup errors, use
[deployment troubleshooting](../troubleshooting/deployment-and-startup.md).

## Optional services

- [Configure AI](../how-to/configure-ai-settings.md) in Admin after signing in.
- [Use PostgreSQL](./postgresql-docker-compose.md) instead of SQLite.
- For local English transcription, follow the repository's
  [local speech guide](https://github.com/markoonakic/tarnished/blob/v0.3.6/deploy/compose/LOCAL-SPEECH.md).
