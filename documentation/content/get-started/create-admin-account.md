---
title: Account setup and recovery
description: Create the first owner, manage accounts and recover access.
---

Tarnished 0.2.0 has no public registration. The installation operator creates the
first account from the host; administrators create later accounts in the web app.
Each user's application records are private from other users, but the host
operator can access the database and files.

## Create the first account

Start Tarnished and let startup migrations finish. In the installation directory:

```bash
docker compose exec app ./entrypoint.sh manage bootstrap-owner --email you@example.com
```

For Helm:

```bash
kubectl exec -it -n tarnished deploy/tarnished -c tarnished -- \
  ./entrypoint.sh manage bootstrap-owner --email you@example.com
```

Enter and confirm the hidden password. Use at least 12 Unicode characters and no
more than 72 UTF-8 bytes. Spaces are allowed. The command requires a terminal;
password arguments and piped passwords are not supported.

Open the browser and sign in with the account you created. Setup runs only once;
deleting accounts does not reopen it. Upgraded installations with existing
accounts do not need setup again.

## Manage accounts

Use **Admin → Users → Create User**. **Edit User** can reset another user's
password, disable/reactivate an account or change its role. Leave the password
field blank to keep it. Administrators cannot delete or demote themselves through
these controls. Change your own password in **Settings → Security**.

Changing a password or account authority invalidates its browser sessions and
signed download links. **Sign out all sessions** invalidates sessions without
changing the password. Ordinary **Sign Out** only clears the current browser's
tokens. API keys remain independent: revoke a compromised key in **Settings →
API Keys**. Disabled accounts cannot use their keys.

## Recover access

Ask another administrator to reset your account, or run this on the installation
host using the same database, storage and signing secret:

```bash
docker compose exec app ./entrypoint.sh manage reset-password --email you@example.com
```

If you also need to reactivate the account, recover administrator access and
revoke its keys, add these explicit options:

```bash
docker compose exec app ./entrypoint.sh manage reset-password --email you@example.com \
  --reactivate --recover-admin --revoke-all-keys
```

The operator command loads the existing signing secret. It does not generate a
new secret or run migrations. Restore missing configuration before recovery.
Personal exports do not restore accounts, passwords, sessions or API keys. See
[backup and restore](../how-to/backup-and-restore-tarnished.md).

For a source installation, use `uv run python -m app.manage` in the configured
backend environment instead of `docker compose exec app ./entrypoint.sh manage`.
See `CONTRIBUTING.md` for a separate development database.

## Next steps

- [Create your first application](./create-your-first-application.md)
- [Create your first API key](./create-your-first-api-key.md)
