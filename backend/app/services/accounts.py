"""Account lifecycle transactions. Host authority is required by app.manage."""

from datetime import UTC, datetime

from sqlalchemy import insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash, validate_new_password
from app.models import User, UserAPIKey
from app.models.system_settings import SystemSettings

OWNER_BOOTSTRAPPED = "owner_bootstrapped"


async def needs_owner_setup(db: AsyncSession) -> bool:
    marker = await db.scalar(
        select(SystemSettings.id).where(SystemSettings.key == OWNER_BOOTSTRAPPED)
    )
    return marker is None and await db.scalar(select(User.id).limit(1)) is None


async def bootstrap_owner(db: AsyncSession, email: str, password: str) -> User:
    password_hash = get_password_hash(validate_new_password(password))
    try:
        # First DB operation: the unique INSERT serializes independent operators.
        await db.execute(
            insert(SystemSettings).values(key=OWNER_BOOTSTRAPPED, value="true")
        )
        if await db.scalar(select(User.id).limit(1)) is not None:
            raise ValueError("Owner setup already completed")
        user = User(
            email=email, password_hash=password_hash, is_admin=True, is_active=True
        )
        db.add(user)
        await db.commit()
        return user
    except IntegrityError:
        await db.rollback()
        raise ValueError("Owner setup already completed") from None
    except BaseException:
        await db.rollback()
        raise


async def update_account(
    db: AsyncSession,
    user_id: str,
    *,
    password: str | None = None,
    is_active: bool | None = None,
    is_admin: bool | None = None,
    expected_version: int | None = None,
    revoke_all_keys: bool = False,
) -> bool:
    """Update credentials/authority and revoke sessions atomically, without committing."""
    values: dict = {"session_version": User.session_version + 1}
    if password is not None:
        values["password_hash"] = get_password_hash(validate_new_password(password))
    if is_active is not None:
        values["is_active"] = is_active
    if is_admin is not None:
        values["is_admin"] = is_admin
    statement = update(User).where(User.id == user_id)
    if expected_version is not None:
        statement = statement.where(User.session_version == expected_version)
    changed = await db.scalar(statement.values(**values).returning(User.id))
    if changed is None:
        return False
    if revoke_all_keys:
        await db.execute(
            update(UserAPIKey)
            .where(UserAPIKey.user_id == user_id, UserAPIKey.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
    return True
