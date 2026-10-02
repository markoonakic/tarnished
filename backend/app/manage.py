"""Host-only owner bootstrap/recovery; no password arguments or credential output."""

import argparse
import asyncio
import getpass
import sys
import warnings

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError


def confirmed_password() -> str:
    from app.core.security import validate_new_password

    # getpass normally falls back to visible stdin when no TTY exists. Fail closed.
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        password = getpass.getpass("New password: ")
        if password != getpass.getpass("Confirm new password: "):
            raise ValueError("Passwords do not match")
    return validate_new_password(password)


async def run(args: argparse.Namespace) -> None:
    from app.core.config import get_settings
    from app.core.database import async_session_maker, engine
    from app.models import User
    from app.services.accounts import bootstrap_owner, update_account

    if not get_settings().secret_key:
        raise ValueError(
            "Configured SECRET_KEY unavailable; restore configuration first"
        )
    try:
        async with async_session_maker() as db:
            revision = await db.scalar(text("SELECT version_num FROM alembic_version"))
            # Verify the required schema without migrating or generating credentials.
            if not revision:
                raise ValueError("Database schema unavailable; run migrations first")
            await db.execute(select(User.session_version).limit(0))
        password = confirmed_password()
        async with async_session_maker() as db:
            if args.command == "bootstrap-owner":
                await bootstrap_owner(db, args.email, password)
            else:
                user = await db.scalar(select(User).where(User.email == args.email))
                if user is None:
                    raise ValueError("Account not found")
                changed = await update_account(
                    db,
                    user.id,
                    password=password,
                    is_active=True if args.reactivate else None,
                    is_admin=True if args.recover_admin else None,
                    revoke_all_keys=args.revoke_all_keys,
                )
                if not changed:
                    raise ValueError("Account no longer exists")
                await db.commit()
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    bootstrap = commands.add_parser(
        "bootstrap-owner", help="Create the one-time initial owner"
    )
    reset = commands.add_parser(
        "reset-password", help="Reset an existing account and invalidate sessions"
    )
    for command in (bootstrap, reset):
        command.add_argument("--email", required=True)
    reset.add_argument(
        "--reactivate", action="store_true", help="Explicitly enable a disabled account"
    )
    reset.add_argument(
        "--recover-admin",
        action="store_true",
        help="Explicitly restore administrator authority",
    )
    reset.add_argument(
        "--revoke-all-keys", action="store_true", help="Also revoke all API keys"
    )
    args = parser.parse_args()
    try:
        args.email = TypeAdapter(EmailStr).validate_python(args.email)
        asyncio.run(run(args))
    except ValidationError:
        print("Invalid email address or instance configuration", file=sys.stderr)
        return 1
    except (ValueError, getpass.GetPassWarning) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except (EOFError, KeyboardInterrupt):
        print("Cancelled; no account changes", file=sys.stderr)
        return 1
    except SQLAlchemyError:
        print(
            "Database unavailable, busy, or schema not ready; check configuration/migrations and retry",
            file=sys.stderr,
        )
        return 1
    print(
        "Account updated; previous browser sessions and signed links are invalid. API keys remain unless explicitly revoked."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
