---
title: Upgrade Tarnished
description: Upgrade Tarnished safely for Docker Compose and Helm deployments.
---

Use this guide when you want to move a running Tarnished deployment to a newer version.

## Before you begin

Before upgrading:

1. Read the target release notes.
2. Take a backup first.
3. Make sure you know which deployment mode you are running.

Start with [Back up and restore Tarnished](./backup-and-restore-tarnished.md).

## Upgrade a Docker Compose install

### If you follow the default `latest` tag flow

Pull the newest image and recreate the stack:

```bash
docker compose pull
docker compose up -d
```

### If you pin a specific Tarnished image tag

Update `TARNISHED_IMAGE` in your `.env` file or shell environment, then pull and recreate the stack.

Example:

```env
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.1.7
```

Then run:

```bash
docker compose pull
docker compose up -d
```

## Upgrade a Helm install

If you manage Tarnished with Helm, run:

```bash
helm upgrade tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --namespace tarnished \
  --values values-production.yaml
```

If you pin chart versions explicitly, include `--version` with the target chart version.

## What Tarnished does during upgrade

For Helm installs, the chart runs database migrations through an init container before the Tarnished app starts.

For Compose-based installs, Tarnished still applies its normal startup flow after the new container comes up.

## Verify after upgrade

Check that Tarnished is healthy:

```bash
curl http://localhost:5577/health
```

Then confirm:

- the app loads in the browser
- you can sign in
- existing applications and files are still present

## If the upgrade goes badly

Use the backup you took before upgrading and restore Tarnished to the previous known-good state.

## Related pages

- [Back up and restore Tarnished](./backup-and-restore-tarnished.md)
- [Install with Docker Compose](../install/docker-compose.md)
- [Install with PostgreSQL Docker Compose](../install/postgresql-docker-compose.md)
- [Install with Helm](../install/helm.md)
