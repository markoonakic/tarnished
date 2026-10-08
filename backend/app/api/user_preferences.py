from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_api_key_scope
from app.models import User
from app.services.user_settings import (
    DEFAULT_USER_PREFERENCES,
    get_user_preferences,
    merge_user_settings,
)

router = APIRouter(prefix="/api/user-preferences", tags=["user-preferences"])


TimeZoneMode = Literal["device", "manual"]


class UserPreferencesUpdate(BaseModel):
    language: Literal["en", "sr-Latn"] | None = None

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Omit unchanged language; null is not allowed")
        return value

    show_streak_stats: bool | None = None
    show_needs_attention: bool | None = None
    show_heatmap: bool | None = None
    time_zone_mode: TimeZoneMode | None = None
    time_zone: str | None = None

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None

        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Invalid IANA time zone") from exc

        return value


class UserPreferencesResponse(BaseModel):
    language: Literal["en", "sr-Latn"]
    show_streak_stats: bool
    show_needs_attention: bool
    show_heatmap: bool
    time_zone_mode: TimeZoneMode
    time_zone: str | None = None


@router.get("", response_model=UserPreferencesResponse)
async def get_preferences(
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("preferences:read")),
):
    """Get user preferences."""
    prefs = get_user_preferences(user.settings)

    return UserPreferencesResponse(**prefs)


@router.patch("", response_model=UserPreferencesResponse)
@router.put("", response_model=UserPreferencesResponse)
async def update_preferences(
    prefs_update: UserPreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("preferences:write")),
):
    """Update user preferences."""
    updates = prefs_update.model_dump(exclude_unset=True)

    if not updates:
        return UserPreferencesResponse(**get_user_preferences(user.settings))

    if updates.get("time_zone") is not None and "time_zone_mode" not in updates:
        updates["time_zone_mode"] = "manual"

    current = await merge_user_settings(
        db,
        user_id=user.id,
        updates=updates,
        ensure_keys=DEFAULT_USER_PREFERENCES,
    )
    preferences = get_user_preferences(current)

    return UserPreferencesResponse(**preferences)
