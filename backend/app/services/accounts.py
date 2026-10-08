"""Account lifecycle transactions for first-run setup and account recovery."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import delete, func, insert, select, update
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
        # First DB operation: the unique INSERT serializes concurrent setup attempts.
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
    approval_pending: bool | None = None,
    expected_version: int | None = None,
    revoke_all_keys: bool = False,
) -> bool:
    """Update credentials/authority and revoke sessions atomically, without committing."""
    from app.services.ai_settings import lock_ai_settings

    await lock_ai_settings(db)
    values: dict = {"session_version": User.session_version + 1}
    if approval_pending is not None:
        if approval_pending:
            raise HTTPException(422, "Pending state is only set by registration")
        values["approval_pending"] = False
        values["is_active"] = True
    elif is_active:
        values["approval_pending"] = False
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


async def guard_last_admin(db: AsyncSession, user_id: str):
    count = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.is_admin.is_(True), User.is_active.is_(True), User.id != user_id)
    )
    if not count:
        raise HTTPException(
            409,
            {
                "code": "last_administrator",
                "message": "You are the only administrator. Make another user an administrator first.",
            },
        )


async def delete_account(
    db: AsyncSession, user_id: str, expected_version: int | None = None
):
    from app.models import AuditLog, InterviewJob, ProcessingJob, TransferJob
    from app.services.ai_settings import lock_ai_settings
    from app.services.import_execution import clear_existing_import_data

    await lock_ai_settings(db)
    user = await db.scalar(
        select(User).where(User.id == user_id).execution_options(populate_existing=True)
    )
    if user is None:
        raise HTTPException(404, "User not found")
    if expected_version is not None and user.session_version != expected_version:
        raise HTTPException(409, "Account changed; sign in again")
    if user.is_admin and user.is_active:
        await guard_last_admin(db, user_id)
    transfer_paths = {
        path
        for job in await db.scalars(
            select(TransferJob).where(TransferJob.user_id == user_id)
        )
        for path in (job.source_path, job.artifact_path)
        if path
    }
    await update_account(db, user_id, revoke_all_keys=True)
    for model in (InterviewJob, ProcessingJob, TransferJob, AuditLog):
        await db.execute(delete(model).where(model.user_id == user_id))
    await clear_existing_import_data(db, user_id)
    await db.delete(user)
    await db.commit()
    from pathlib import Path

    from sqlalchemy import or_

    for stored_path in transfer_paths:
        if not await db.scalar(
            select(TransferJob.id)
            .where(
                or_(
                    TransferJob.source_path == stored_path,
                    TransferJob.artifact_path == stored_path,
                )
            )
            .limit(1)
        ):
            path = Path(stored_path)
            if path.is_file() and not path.is_symlink():
                path.unlink(missing_ok=True)
