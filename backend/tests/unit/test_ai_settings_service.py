from sqlalchemy.orm import Session

from app.core.security import encrypt_api_key
from app.models import SystemSettings
from app.schemas.ai_settings import AISettingsUpdate
from app.services.ai_settings import (
    get_ai_settings,
    get_ai_settings_sync,
    update_ai_settings,
)


async def test_get_ai_settings_decrypts_and_masks_api_key(db):
    db.add_all(
        [
            SystemSettings(
                key=SystemSettings.KEY_LITELLM_MODEL,
                value="openai/gpt-4o-mini",
            ),
            SystemSettings(
                key=SystemSettings.KEY_LITELLM_API_KEY,
                value=encrypt_api_key("sk-secret-1234"),
            ),
            SystemSettings(
                key=SystemSettings.KEY_LITELLM_BASE_URL,
                value="https://litellm.example.com",
            ),
        ]
    )
    await db.commit()

    settings = await get_ai_settings(db)

    assert settings.model == "openai/gpt-4o-mini"
    assert settings.api_key == "sk-secret-1234"
    assert settings.masked_api_key == "...1234"
    assert settings.base_url == "https://litellm.example.com"
    assert settings.is_configured is True


async def test_update_ai_settings_preserves_existing_api_key_when_omitted(db):
    db.add_all(
        [
            SystemSettings(
                key=SystemSettings.KEY_LITELLM_MODEL,
                value="openai/gpt-4o-mini",
            ),
            SystemSettings(
                key=SystemSettings.KEY_LITELLM_API_KEY,
                value=encrypt_api_key("sk-secret-1234"),
            ),
        ]
    )
    await db.commit()

    settings = await update_ai_settings(
        db,
        AISettingsUpdate(litellm_model="anthropic/claude-3-5-sonnet"),
    )

    assert settings.model == "anthropic/claude-3-5-sonnet"
    assert settings.api_key == "sk-secret-1234"
    assert settings.masked_api_key == "...1234"
    assert settings.is_configured is True


async def test_get_ai_settings_sync_reads_existing_settings(db):
    db.add_all(
        [
            SystemSettings(
                key=SystemSettings.KEY_LITELLM_MODEL,
                value="openai/gpt-4o-mini",
            ),
            SystemSettings(
                key=SystemSettings.KEY_LITELLM_API_KEY,
                value=encrypt_api_key("sk-secret-1234"),
            ),
        ]
    )
    await db.commit()

    def load_settings(sync_db: Session):
        return get_ai_settings_sync(sync_db)

    settings = await db.run_sync(load_settings)

    assert settings.model == "openai/gpt-4o-mini"
    assert settings.api_key == "sk-secret-1234"
    assert settings.is_configured is True
