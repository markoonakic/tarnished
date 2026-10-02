from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user_flexible, require_api_key_scope
from app.core.themes import (
    ACCENT_OPTIONS,
    DEFAULT_ACCENT,
    DEFAULT_THEME,
    THEMES,
    get_theme_colors,
)
from app.models import User
from app.schemas.settings import UserSettingsResponse, UserSettingsUpdate
from app.services.user_settings import merge_user_settings, normalize_user_settings

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/settings", response_model=UserSettingsResponse)
async def get_user_settings(
    current_user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("user_settings:read")),
):
    """Get user theme settings with resolved colors for extension."""
    settings = normalize_user_settings(current_user.settings)
    theme = settings.get("theme", DEFAULT_THEME)
    accent = settings.get("accent", DEFAULT_ACCENT)

    colors = get_theme_colors(theme, accent)

    return UserSettingsResponse(theme=theme, accent=accent, colors=colors)  # type: ignore[arg-type]


@router.patch("/settings")
async def update_user_settings(
    update: UserSettingsUpdate,
    current_user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("user_settings:write")),
    db: AsyncSession = Depends(get_db),
):
    """Update user theme settings."""
    updates: dict[str, str] = {}

    if update.theme is not None:
        if update.theme not in THEMES:
            raise HTTPException(
                status_code=400, detail=f"Invalid theme. Options: {list(THEMES.keys())}"
            )
        updates["theme"] = update.theme

    if update.accent is not None:
        if update.accent not in ACCENT_OPTIONS:
            raise HTTPException(
                status_code=400, detail=f"Invalid accent. Options: {ACCENT_OPTIONS}"
            )
        updates["accent"] = update.accent

    if not updates:
        return {
            "message": "Settings updated",
            "settings": normalize_user_settings(current_user.settings),
        }

    settings = await merge_user_settings(db, user_id=current_user.id, updates=updates)

    return {"message": "Settings updated", "settings": settings}
