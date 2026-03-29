"""AI Settings router for LiteLLM configuration (admin only)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models import User
from app.schemas.ai_settings import AISettingsResponse, AISettingsUpdate
from app.services.ai_settings import (
    get_ai_settings as get_ai_settings_state,
)
from app.services.ai_settings import (
    update_ai_settings as update_ai_settings_state,
)

router = APIRouter(prefix="/api/admin/ai-settings", tags=["ai-settings"])


@router.get("", response_model=AISettingsResponse)
async def get_ai_settings(
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AISettingsResponse:
    """Get current AI/LiteLLM configuration.

    Returns masked API key for security. Admin only.
    """
    settings = await get_ai_settings_state(db)

    return AISettingsResponse(
        litellm_model=settings.model,
        litellm_api_key_masked=settings.masked_api_key,
        litellm_base_url=settings.base_url,
        is_configured=settings.is_configured,
    )


@router.put("", response_model=AISettingsResponse)
async def update_ai_settings(
    data: AISettingsUpdate,
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AISettingsResponse:
    """Update AI/LiteLLM configuration.

    Accepts optional fields to update. API key will be encrypted before storage.
    Admin only.
    """
    settings = await update_ai_settings_state(db, data)

    return AISettingsResponse(
        litellm_model=settings.model,
        litellm_api_key_masked=settings.masked_api_key,
        litellm_base_url=settings.base_url,
        is_configured=settings.is_configured,
    )
