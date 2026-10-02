---
title: Back up and restore Tarnished
description: Preserve application data, uploads, secrets and configuration as one recovery set.
---

A personal export helps you move records. It is not a full instance backup:
credentials, installation secrets and deployment settings need separate protection.
These storage rules apply to both Compose database modes.

## What to preserve

| Installation            | Required recovery data                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Compose with SQLite     | Complete `./data`, `docker-compose.yml`, `.env` and any overrides                        |
| Compose with PostgreSQL | Complete `./data`, the PostgreSQL database, Compose files and `.env`                     |
| Helm                    | The `/app/data` PVC, database if external, Helm values and configured Kubernetes Secrets |

Include hidden files. In the default Compose setup, `data/.secret_key` contains
the generated signing and encryption secret. If you pass `SECRET_KEY` explicitly,
back up that value through your secret-management system instead. Helm installs
can use `secretKey.existingSecret`; preserve that Secret.

Losing the secret invalidates sessions and signed download links, affects API-key
authentication, and prevents decryption of stored AI credentials. User passwords
are stored as bcrypt hashes and do not depend on that secret. A new secret is not
a substitute for the original during recovery.

Keep backups outside the live data directory, restrict access and encrypt them
where appropriate. Record the Tarnished image/chart version and PostgreSQL major
version with each backup. Test recovery in an isolated instance before relying on
it.

## Back up Docker Compose

Run commands from the install directory. If you use a different Compose filename,
add `-f <filename>` to each command.

1. Wait for active imports, exports and other work to finish.
2. Stop the services:

   ```bash
   docker compose stop
   ```

3. Copy the complete recovery set to a **new** protected backup destination with
   your backup tool. For SQLite, copy all of `data`, not just `app.db`. For the
   packaged PostgreSQL setup, copy both `data` and `postgres_data` while **both
   services remain stopped**. Include the deployment files and secrets above.
4. Preserve file ownership and permissions. The PostgreSQL directory normally
   belongs to the container's database user and needs elevated host/daemon access
   to copy. Do not loosen its permissions to make a copy work.
5. Check that the backup completed, then restart:

   ```bash
   docker compose start
   ```

Do not make an ordinary filesystem copy of a running database. If downtime is not
acceptable, use SQLite-aware backup tooling or PostgreSQL's supported logical or
physical backup tools, and coordinate the uploads snapshot with the database.
For external PostgreSQL, stopping the app does not stop the database server.

## Back up Helm

Use your cluster and storage platform's backup tools. Coordinate the app/PVC
snapshot with the database backup, and include the signing secret and database
credentials. PVC access-mode labels alone do not make a live filesystem snapshot
consistent.

Stop all application work before offline storage
maintenance. Do not delete lock files or run cleanup against a live instance.

## Restore Docker Compose

A restore replaces instance state. Keep a copy of the current installation until
the recovered instance is verified.

1. Select a complete backup and its matching image/configuration. Do not start
   with a newer image that can migrate the restored database unexpectedly.
2. Stop the services with `docker compose stop`.
3. Move the existing data directories to a separate recovery location. Do not
   delete them or overwrite them in place.
4. Restore `data`, the database and the matching secrets/configuration. For a
   physical PostgreSQL directory backup, use the same PostgreSQL major version
   and compatible storage environment. Use PostgreSQL restore tools for a logical
   dump instead of copying it into `postgres_data`.
5. Restore the original ownership and permissions. Do not run a blanket recursive
   `chown` across PostgreSQL storage using the app's UID.
6. Start the restored configuration:

   ```bash
   docker compose up -d
   ```

Changing the password in `.env` does not change an existing PostgreSQL user's
password. Restore the matching password; do not generate a new one as a repair.

## Restore Helm

Stop the workload before restoring. Restore the PVC contents, database,
configuration and Secrets as one recovery set. Use the matching chart and image
versions, then start the workload through your normal cluster process. Retain the
previous recovery set until verification succeeds.

## Verify after restore

Check the health endpoint at your configured URL:

```bash
curl -fsS http://localhost:5577/health
```

Then confirm that you can sign in, see the expected application records and open
uploaded files. Check startup logs for migration or decryption errors. Verify a
stored API key only against the intended restored instance. Do not trigger paid
AI work simply to test a restore.

## Related pages

- [Import and export data](./import-and-export-data.md)
- [Upgrade Tarnished](./upgrade-tarnished.md)
- [Environment variables](../reference/environment-variables.md)
