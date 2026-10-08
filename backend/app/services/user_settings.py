from collections.abc import Mapping
from typing import Any, Literal, TypedDict

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import User

TimeZoneMode = Literal["device", "manual"]


class UserPreferencesSettings(TypedDict):
    language: Literal["en", "sr-Latn"]
    show_streak_stats: bool
    show_needs_attention: bool
    show_heatmap: bool
    time_zone_mode: TimeZoneMode
    time_zone: str | None


DEFAULT_USER_PREFERENCES: UserPreferencesSettings = {
    "language": "en",
    "show_streak_stats": True,
    "show_needs_attention": True,
    "show_heatmap": True,
    "time_zone_mode": "device",
    "time_zone": None,
}


def normalize_user_settings(settings: dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(settings, dict):
        return dict(settings)
    return {}


def get_user_preferences(
    settings: dict[str, Any] | None,
) -> UserPreferencesSettings:
    current = normalize_user_settings(settings)

    show_streak_stats = current.get(
        "show_streak_stats", DEFAULT_USER_PREFERENCES["show_streak_stats"]
    )
    show_needs_attention = current.get(
        "show_needs_attention",
        DEFAULT_USER_PREFERENCES["show_needs_attention"],
    )
    show_heatmap = current.get("show_heatmap", DEFAULT_USER_PREFERENCES["show_heatmap"])
    time_zone_mode = current.get(
        "time_zone_mode",
        DEFAULT_USER_PREFERENCES["time_zone_mode"],
    )
    time_zone = current.get("time_zone", DEFAULT_USER_PREFERENCES["time_zone"])

    return {
        "language": "sr-Latn" if current.get("language") == "sr-Latn" else "en",
        "show_streak_stats": bool(show_streak_stats),
        "show_needs_attention": bool(show_needs_attention),
        "show_heatmap": bool(show_heatmap),
        "time_zone_mode": (
            time_zone_mode
            if time_zone_mode in {"device", "manual"}
            else DEFAULT_USER_PREFERENCES["time_zone_mode"]
        ),
        "time_zone": (
            time_zone if isinstance(time_zone, str) or time_zone is None else None
        ),
    }


async def merge_user_settings(
    db: AsyncSession,
    *,
    user_id: str,
    updates: Mapping[str, Any],
    ensure_keys: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    # SQLite ignores FOR UPDATE, so acquire the write lock before reading JSON.
    await db.execute(
        update(User).where(User.id == user_id).values(settings=User.settings)
    )
    stmt = (
        select(User).where(User.id == user_id).execution_options(populate_existing=True)
    )
    result = await db.execute(stmt)
    user = result.scalar_one()

    current = normalize_user_settings(user.settings)
    current.update(updates)

    if ensure_keys:
        for key, value in ensure_keys.items():
            current.setdefault(key, value)

    user.settings = current
    flag_modified(user, "settings")
    await db.commit()
    return current
