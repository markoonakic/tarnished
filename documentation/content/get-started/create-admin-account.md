---
title: Account setup and recovery
description: Create the first owner, manage accounts and recover access.
---

Tarnished 0.3.6 lets you create the first admin account in the browser.
Later users can request an account from the sign-in page. An administrator must
approve each request before the account can sign in.
Each user's application records are private from other users, but the host
operator can access the database and files.

## Create the first account

Start Tarnished and let startup migrations finish. Open your instance in a
browser, normally **http://localhost:5577**. Select **Create the first admin
account** on the sign-in page, or open `/register` directly.

Enter your email, password and password confirmation, then select **Create admin
account**. You are signed in and taken to the dashboard automatically.

Setup runs only once; concurrent requests cannot create extra owners. Deleting
accounts does not reopen setup. Upgraded installations with existing accounts do
not need setup again.

## Manage accounts

Use **Admin → Users → Pending** to approve or reject account requests, or
**Create User** to add an account directly. **Edit User** can reset another user's
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

For Helm, use the same recovery command in the application container:

```bash
kubectl exec -it -n tarnished deploy/tarnished -c tarnished -- \
  ./entrypoint.sh manage reset-password --email you@example.com
```

If browser setup is unavailable on a fresh installation, the recovery CLI can
create the first owner instead:

```bash
docker compose exec app ./entrypoint.sh manage bootstrap-owner --email you@example.com
```

Recovery commands prompt privately for a password and require a terminal.
Password arguments and piped passwords are not supported. Bootstrap works only
before setup is complete; it cannot bypass the permanent setup marker.

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
