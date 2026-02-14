"""AI Settings router for LiteLLM configuration (admin only)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.security import decrypt_api_key, encrypt_api_key
from app.models import SystemSettings, User
from app.schemas.ai_settings import AISettingsResponse, AISettingsUpdate

router = APIRouter(prefix="/api/admin/ai-settings", tags=["ai-settings"])


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    """Get a setting value by key from the database."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalars().first()
    return setting.value if setting else None


async def _upsert_setting(db: AsyncSession, key: str, value: str | None) -> None:
    """Upsert a setting value in the database.

    Creates the setting if it doesn't exist, updates it if it does.
    If value is None, the setting is deleted from the database.

    Args:
        db: Database session.
        key: Setting key.
        value: Setting value, or None to delete.
    """
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalars().first()

    if value is None:
        # Delete the setting if it exists and value is None
        if setting:
            await db.delete(setting)
    elif setting:
        # Update existing setting
        setting.value = value
    else:
        # Create new setting
        setting = SystemSettings(key=key, value=value)
        db.add(setting)


def _mask_api_key(api_key: str | None) -> str | None:
    """Mask API key, showing only last 4 characters.

    Args:
        api_key: The API key to mask.

    Returns:
        Masked key in format "...abcd" or None if no key provided.
    """
    if not api_key:
        return None
    if len(api_key) <= 4:
        return "****"
    return f"...{api_key[-4:]}"


@router.get("", response_model=AISettingsResponse)
async def get_ai_settings(
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AISettingsResponse:
    """Get current AI/LiteLLM configuration.

    Returns masked API key for security. Admin only.
    """
    # Read settings from database
    model = await _get_setting(db, SystemSettings.KEY_LITELLM_MODEL)
    encrypted_api_key = await _get_setting(db, SystemSettings.KEY_LITELLM_API_KEY)
    base_url = await _get_setting(db, SystemSettings.KEY_LITELLM_BASE_URL)

    # Decrypt the API key if present
    api_key = None
    if encrypted_api_key:
        api_key = decrypt_api_key(encrypted_api_key)

    # Determine if fully configured (need both model and decrypted API key)
    is_configured = bool(model and api_key)

    return AISettingsResponse(
        litellm_model=model,
        litellm_api_key_masked=_mask_api_key(api_key),
        litellm_base_url=base_url,
        is_configured=is_configured,
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
    # Encrypt the API key before storing if provided
    encrypted_api_key = None
    if data.litellm_api_key:
        encrypted_api_key = encrypt_api_key(data.litellm_api_key)

    # Store settings in database (upsert logic)
    await _upsert_setting(db, SystemSettings.KEY_LITELLM_MODEL, data.litellm_model)
    await _upsert_setting(db, SystemSettings.KEY_LITELLM_API_KEY, encrypted_api_key)
    await _upsert_setting(db, SystemSettings.KEY_LITELLM_BASE_URL, data.litellm_base_url)

    # Commit the changes
    await db.commit()

    # Determine if fully configured (need both model and API key)
    is_configured = bool(data.litellm_model and data.litellm_api_key)

    return AISettingsResponse(
        litellm_model=data.litellm_model,
        litellm_api_key_masked=_mask_api_key(data.litellm_api_key),
        litellm_base_url=data.litellm_base_url,
        is_configured=is_configured,
    )
