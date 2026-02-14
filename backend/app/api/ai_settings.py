"""AI Settings router for LiteLLM configuration (admin only)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models import User
from app.schemas.ai_settings import AISettingsResponse, AISettingsUpdate

router = APIRouter(prefix="/api/admin/ai-settings", tags=["ai-settings"])


@router.get("", response_model=AISettingsResponse)
async def get_ai_settings(
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AISettingsResponse:
    """Get current AI/LiteLLM configuration.

    Returns masked API key for security. Admin only.
    """
    # TODO: Read from settings store (Task 4.3)
    # For now, return placeholder indicating not configured
    return AISettingsResponse(
        litellm_model=None,
        litellm_api_key_masked=None,
        litellm_base_url=None,
        is_configured=False,
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
    # TODO: Implement settings storage (Task 4.4)
    # TODO: Encrypt API key before storing (Task 4.5)
    # For now, return placeholder with the updated values
    return AISettingsResponse(
        litellm_model=data.litellm_model,
        litellm_api_key_masked=f"...{data.litellm_api_key[-4:]}" if data.litellm_api_key else None,
        litellm_base_url=data.litellm_base_url,
        is_configured=bool(data.litellm_model and data.litellm_api_key),
    )
