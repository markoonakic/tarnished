"""Shared AI settings access helpers."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.security import decrypt_api_key, encrypt_api_key
from app.models import SystemSettings
from app.schemas.ai_settings import AISettingsUpdate


@dataclass(slots=True)
class AISettingsState:
    model: str | None
    api_key: str | None
    base_url: str | None

    @property
    def masked_api_key(self) -> str | None:
        if not self.api_key:
            return None
        if len(self.api_key) <= 4:
            return "****"
        return f"...{self.api_key[-4:]}"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)


AI_SETTINGS_KEYS = (
    SystemSettings.KEY_LITELLM_MODEL,
    SystemSettings.KEY_LITELLM_API_KEY,
    SystemSettings.KEY_LITELLM_BASE_URL,
)


def _settings_to_state(settings_map: dict[str, str | None]) -> AISettingsState:
    encrypted_api_key = settings_map.get(SystemSettings.KEY_LITELLM_API_KEY)
    api_key = decrypt_api_key(encrypted_api_key) if encrypted_api_key else None
    return AISettingsState(
        model=settings_map.get(SystemSettings.KEY_LITELLM_MODEL),
        api_key=api_key,
        base_url=settings_map.get(SystemSettings.KEY_LITELLM_BASE_URL),
    )


async def _load_settings_records(
    db: AsyncSession,
) -> dict[str, SystemSettings]:
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key.in_(AI_SETTINGS_KEYS))
    )
    return {setting.key: setting for setting in result.scalars().all()}


def _load_settings_records_sync(db: Session) -> dict[str, SystemSettings]:
    result = db.execute(
        select(SystemSettings).where(SystemSettings.key.in_(AI_SETTINGS_KEYS))
    )
    return {setting.key: setting for setting in result.scalars().all()}


async def get_ai_settings(db: AsyncSession) -> AISettingsState:
    records = await _load_settings_records(db)
    return _settings_to_state({key: record.value for key, record in records.items()})


def get_ai_settings_sync(db: Session) -> AISettingsState:
    records = _load_settings_records_sync(db)
    return _settings_to_state({key: record.value for key, record in records.items()})


async def update_ai_settings(
    db: AsyncSession, data: AISettingsUpdate
) -> AISettingsState:
    records = await _load_settings_records(db)

    updates: dict[str, str | None] = {}

    if "litellm_model" in data.model_fields_set:
        updates[SystemSettings.KEY_LITELLM_MODEL] = data.litellm_model

    if "litellm_base_url" in data.model_fields_set:
        updates[SystemSettings.KEY_LITELLM_BASE_URL] = data.litellm_base_url

    if "litellm_api_key" in data.model_fields_set:
        updates[SystemSettings.KEY_LITELLM_API_KEY] = (
            encrypt_api_key(data.litellm_api_key) if data.litellm_api_key else None
        )

    for key, value in updates.items():
        if value is None:
            if key in records:
                await db.delete(records[key])
                del records[key]
            continue

        if key in records:
            records[key].value = value
        else:
            setting = SystemSettings(key=key, value=value)
            db.add(setting)
            records[key] = setting

    await db.commit()
    return await get_ai_settings(db)
