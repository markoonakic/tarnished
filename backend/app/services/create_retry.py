"""Recover one create intent under the existing database write lock."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from app.services.ai_settings import lock_ai_settings


def check_create_values(row, values: dict) -> None:
    def canonical(value):
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, datetime):
            return (
                value.replace(tzinfo=UTC) if value.tzinfo is None else value
            ).astimezone(UTC)
        return value

    if any(
        canonical(getattr(row, key)) != canonical(value)
        for key, value in values.items()
    ):
        raise HTTPException(409, {"code": "create_content_changed"})


async def recover_create(db, model, key: UUID | None, user_id: str, values: dict):
    if key is None:
        return None
    await lock_ai_settings(db)
    row = await db.scalar(
        select(model)
        .where(model.id == str(key))
        .execution_options(populate_existing=True)
    )
    if row is not None:
        if row.user_id != user_id:
            raise HTTPException(409, "Request key is already in use")
        check_create_values(row, values)
    return row
