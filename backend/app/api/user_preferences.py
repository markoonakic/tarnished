from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/user-preferences", tags=["user-preferences"])


class UserPreferencesUpdate(BaseModel):
    show_streak_stats: bool | None = None
    show_needs_attention: bool | None = None
    show_heatmap: bool | None = None


class UserPreferencesResponse(BaseModel):
    show_streak_stats: bool
    show_needs_attention: bool
    show_heatmap: bool


def get_default_preferences() -> dict:
    return {
        "show_streak_stats": True,
        "show_needs_attention": True,
        "show_heatmap": True
    }


@router.get("", response_model=UserPreferencesResponse)
async def get_preferences(user: User = Depends(get_current_user)):
    """Get user preferences."""
    prefs = user.settings or {}
    defaults = get_default_preferences()

    return UserPreferencesResponse(
        show_streak_stats=prefs.get("show_streak_stats", defaults["show_streak_stats"]),
        show_needs_attention=prefs.get("show_needs_attention", defaults["show_needs_attention"]),
        show_heatmap=prefs.get("show_heatmap", defaults["show_heatmap"]),
    )


@router.put("", response_model=UserPreferencesResponse)
async def update_preferences(
    prefs_update: UserPreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update user preferences."""
    current = user.settings or {}
    defaults = get_default_preferences()

    # Merge updates
    updates = prefs_update.model_dump(exclude_unset=True)
    for key, value in updates.items():
        current[key] = value

    # Ensure all keys exist
    for key in defaults:
        if key not in current:
            current[key] = defaults[key]

    user.settings = current
    flag_modified(user, "settings")
    await db.commit()

    return UserPreferencesResponse(
        show_streak_stats=current["show_streak_stats"],
        show_needs_attention=current["show_needs_attention"],
        show_heatmap=current["show_heatmap"],
    )
