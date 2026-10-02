"""AI Settings router for LiteLLM configuration (admin only)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user, require_api_key_scope
from app.models import User
from app.schemas.ai_settings import (
    AISettingsResponse,
    AISettingsUpdate,
    CapabilitiesResponse,
)
from app.services.ai_settings import (
    get_ai_settings as get_ai_settings_state,
)
from app.services.ai_settings import (
    update_ai_settings as update_ai_settings_state,
)
from app.services.local_speech import inspect_local_speech

router = APIRouter(tags=["ai-settings"])


@router.get("/api/admin/ai-settings", response_model=AISettingsResponse)
async def get_ai_settings(
    _: User = Depends(get_current_admin),
    __: object = Depends(require_api_key_scope("admin:read")),
    db: AsyncSession = Depends(get_db),
) -> AISettingsResponse:
    """Get current AI/LiteLLM configuration.

    Returns masked API key for security. Admin only.
    """
    settings = await get_ai_settings_state(db)

    return settings.admin_response()


@router.get("/api/admin/ai-settings/local-speech-status")
async def local_speech_status(
    _: User = Depends(get_current_admin),
    __: object = Depends(require_api_key_scope("admin:read")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Explicit cache inspection only; never dispatch inference/download/registry."""
    speech = (await get_ai_settings_state(db)).speech
    if speech.provider != "local" or not speech.is_configured:
        return {
            "status": "not_configured",
            "message": "Save an enabled local configuration first. No service check was made.",
            "installed": [],
        }
    return await inspect_local_speech(speech.base_url or "")


@router.put("/api/admin/ai-settings", response_model=AISettingsResponse)
async def update_ai_settings(
    data: AISettingsUpdate,
    _: User = Depends(get_current_admin),
    __: object = Depends(require_api_key_scope("admin:write")),
    db: AsyncSession = Depends(get_db),
) -> AISettingsResponse:
    """Update AI/LiteLLM configuration.

    Accepts optional fields to update. API key will be encrypted before storage.
    Admin only.
    """
    settings = await update_ai_settings_state(db, data)

    return settings.admin_response()


@router.get("/api/ai-capabilities", response_model=CapabilitiesResponse)
async def get_capabilities(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CapabilitiesResponse:
    """Safe installation disclosure for any authenticated user; never dispatches."""
    settings = await get_ai_settings_state(db)
    return CapabilitiesResponse(
        text=settings.disclosure(), speech=settings.speech.disclosure()
    )
