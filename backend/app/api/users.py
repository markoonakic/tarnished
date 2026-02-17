from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user_by_api_token
from app.core.themes import get_theme_colors, DEFAULT_THEME, DEFAULT_ACCENT, THEMES, ACCENT_OPTIONS
from app.models import User
from app.schemas.settings import UserSettingsResponse, UserSettingsUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/settings", response_model=UserSettingsResponse)
async def get_user_settings(
    current_user: User = Depends(get_current_user_by_api_token)
):
    """Get user theme settings with resolved colors for extension."""
    settings = current_user.settings or {}
    theme = settings.get("theme", DEFAULT_THEME)
    accent = settings.get("accent", DEFAULT_ACCENT)

    colors = get_theme_colors(theme, accent)

    return UserSettingsResponse(
        theme=theme,
        accent=accent,
        colors=colors
    )


@router.patch("/settings")
async def update_user_settings(
    update: UserSettingsUpdate,
    current_user: User = Depends(get_current_user_by_api_token),
    db: AsyncSession = Depends(get_db)
):
    """Update user theme settings."""
    settings = current_user.settings or {}

    if update.theme is not None:
        if update.theme not in THEMES:
            raise HTTPException(status_code=400, detail=f"Invalid theme. Options: {list(THEMES.keys())}")
        settings["theme"] = update.theme

    if update.accent is not None:
        if update.accent not in ACCENT_OPTIONS:
            raise HTTPException(status_code=400, detail=f"Invalid accent. Options: {ACCENT_OPTIONS}")
        settings["accent"] = update.accent

    current_user.settings = settings
    await db.commit()

    return {"message": "Settings updated", "settings": settings}
