---
title: Upgrade Tarnished
description: Back up your installation and upgrade to a selected release.
---

## Before upgrading

Read the [release notes](https://github.com/markoonakic/tarnished/releases) and
make a [complete backup](./backup-and-restore-tarnished.md) of the database,
uploads, signing secret and deployment configuration. Plan for a short downtime.

For 0.2.0, existing accounts remain usable. The session upgrade invalidates old
browser tokens, so users must sign in again. Public registration is disabled;
use Admin to create accounts. Existing accounts do not need owner setup again.

## Docker Compose

Update your Compose file to the target version if its configuration has changed.
Preserve local overrides, the database password, URL and port binding. Set the
image in `.env`:

```dotenv
TARNISHED_IMAGE=ghcr.io/markoonakic/tarnished:0.3.6
```

A shell `TARNISHED_IMAGE` overrides `.env`. From the install directory:

```bash
docker compose stop app
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
```

## Helm

Keep your existing values, PVC and Secrets:

```bash
helm upgrade tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --version 0.3.6 --namespace tarnished --values values-production.yaml
kubectl rollout status -n tarnished deploy/tarnished
```

Check any `image.tag` override so the application matches the chart version.

## Verify or recover

Startup applies migrations. Check `/health`, sign in, read existing applications
and open uploaded files. Inspect logs if a migration fails; do not remove
migration records or generate a new signing secret to force startup.

For rollback, restore the matching previous database, uploads, secrets and
configuration with the previous image/chart. Reverting only the image can leave
an older application against a newer schema. Keep the failed state separately
until recovery is verified.
