# Tarnished

Tarnished is a self-hosted job application tracker. Keep applications, job leads,
documents and interview records in one place. Use the dashboard and analytics to
plan your next step.

[Documentation](https://markoonakic.github.io/tarnished/) ·
[Releases](https://github.com/markoonakic/tarnished/releases) ·
[Report a problem](https://github.com/markoonakic/tarnished/issues)

## Quick start

You need Docker with Compose v2 and `curl`. No Python, Node.js or AI key is needed.
This installs the published Tarnished container image for **v0.2.2** with SQLite.
The download commands require that release to be published. For an unreleased
source checkout, use [Run from source](#run-from-source) below.

```bash
mkdir tarnished && cd tarnished
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/markoonakic/tarnished/v0.2.2/deploy/compose/docker-compose.yml
docker compose up -d --wait
```

Open **http://localhost:5577** and create the first admin account in the browser.
Finish this step before exposing the instance to other networks.

You are signed in automatically. Add your first application. Later accounts are
created in **Admin → Users**. Setup works only once; there is no public registration
when setup is complete. The manage CLI is for recovery. See
[account setup and recovery](documentation/content/get-started/create-admin-account.md).

The default port is local-only. Set `APP_PORT` and `APP_URL` in a `.env` file to
change the binding and public URL. Use HTTPS for remote access. AI is optional:
configure text or speech services in **Admin → AI Configuration** only if you
want to use them. The application does not download speech models at startup.

Check startup with `docker compose ps` and `docker compose logs --tail=100 app`.
The `/health` endpoint returns `{"status":"healthy"}`.

## Run from source

From the root of a source checkout, build the image and use its Compose file:

```bash
docker build -t tarnished:local .
TARNISHED_IMAGE=tarnished:local docker compose -f deploy/compose/docker-compose.yml up -d --wait
```

Open **http://localhost:5577** and create the first admin account in the browser.
This Compose file stores data in
`deploy/compose/data`. Keep `TARNISHED_IMAGE=tarnished:local` on later Compose
commands so they continue to use your local build.

## Features

- Track application dates, statuses, salary, contacts and interview rounds.
- Save job leads without AI, edit their fields and convert them to applications.
- Keep CVs, cover letters, notes, recordings and editable interview transcripts.
- Review activity, pipeline stages and response statistics in your time zone.
- Request optional AI extraction and source-linked interview, application or
  pipeline feedback. Review generated advice before you use it.
- Configure themes, statuses, round types and optional dashboard sections.
- Use scoped API keys with the CLI and browser extension.
- Export JSON, CSV or ZIP archives with media, and import supported archives.

## Other installation options

| Method | Guide |
| --- | --- |
| Docker Compose with SQLite | [SQLite installation](documentation/content/install/docker-compose.md) |
| Docker Compose with PostgreSQL | [PostgreSQL installation](documentation/content/install/postgresql-docker-compose.md) |
| Helm on Kubernetes | [Helm installation](documentation/content/install/helm.md) |
| Optional local English speech | [Local speech setup](deploy/compose/LOCAL-SPEECH.md) |

All installations run one application process. Updates require a short downtime.

## CLI and browser extension

Install the CLI with [uv](https://docs.astral.sh/uv/):

```bash
uv tool install tarnished-cli==0.2.2
```

Create a key in **Settings → API Keys**, then follow the [CLI guide](cli/README.md).
The [browser extension](extension/README.md) detects job pages, saves leads and
fills matching profile fields. Download Chrome or Firefox ZIPs from the release
assets. Site markup and iframe permissions can limit detection and autofill.

## Data and privacy

SQLite stores the database, uploads and signing secret in `./data`. PostgreSQL
Compose also stores its database in `./postgres_data`. Keep these directories,
deployment configuration and secrets in a protected backup. A personal export is
not an instance backup. Read [backup and restore](documentation/content/how-to/backup-and-restore-tarnished.md)
before an upgrade.

Self-hosting does not hide data from the host operator. Optional AI requests can
send job details, documents, transcripts or profile data to the configured
provider and can incur charges. Local speech runs on your server; text analysis
is configured separately.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and checks. Report bugs with
the version, installation method, reproduction steps and redacted logs. Do not
include passwords or API keys.

[MIT License](LICENSE).
