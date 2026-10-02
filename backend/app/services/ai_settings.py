"""Coherent installation settings snapshots and serialized, revision-bound updates."""

from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

from litellm import provider_list
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_api_key, encrypt_api_key
from app.models import SystemSettings
from app.schemas.ai_settings import (
    IDENTIFIER,
    AISettingsResponse,
    AISettingsUpdate,
    CapabilityResponse,
)
from app.services.local_speech import LOCAL_MODELS, is_local_endpoint


class CapabilityUnavailableError(ValueError):
    """Safe, actionable installation configuration error."""


DEFAULT_TEXT_MODEL = "openai/gpt-4o-mini"
LOCK_KEY = "ai_settings_write_lock"
TEXT_KEYS = (
    "litellm_model",
    "litellm_api_key",
    "litellm_base_url",
    "text_protocol",
    "text_enabled",
    "text_keyless",
)
SPEECH_KEYS = (
    "speech_enabled",
    "speech_provider",
    "speech_model",
    "speech_endpoint",
    "speech_api_key",
    "speech_keyless",
)
AI_SETTINGS_KEYS = (*TEXT_KEYS, *SPEECH_KEYS, "text_revision", "speech_revision")
DEFAULTS = {
    "text_enabled": "true",
    "text_keyless": "false",
    "text_protocol": "chat_completions",
    "speech_enabled": "false",
    "speech_keyless": "false",
}


@dataclass(slots=True)
class CapabilitySettingsState:
    model: str | None
    api_key: str | None = field(repr=False)
    base_url: str | None = field(repr=False)
    enabled: bool = True
    keyless: bool = False
    revision: str = "0"
    provider: str | None = None
    kind: str = "text"
    protocol: str = "chat_completions"

    @property
    def effective_model(self) -> str | None:
        return self.model or (DEFAULT_TEXT_MODEL if self.kind == "text" else None)

    @property
    def masked_api_key(self) -> str | None:
        return "****" if self.api_key else None

    @property
    def configuration_status(
        self,
    ) -> Literal["disabled", "incomplete", "unsupported", "configured"]:
        if not self.enabled:
            return "disabled"
        model = self.effective_model
        if not model or (self.kind == "speech" and not self.provider):
            return "incomplete"
        if not IDENTIFIER.fullmatch(model) or "://" in model:
            return "unsupported"
        if self.kind == "speech":
            if self.provider == "local":
                if model not in LOCAL_MODELS or not self.keyless:
                    return "unsupported"
                if self.base_url and not is_local_endpoint(self.base_url):
                    return "unsupported"
            elif self.provider != "openai" or "/" in model:
                return "unsupported"
            # This SDK route never guesses an endpoint, even for keyed settings.
            if not self.base_url:
                return "incomplete"
            endpoint = urlsplit(self.base_url)
            if (
                endpoint.username
                or endpoint.password
                or endpoint.query
                or endpoint.fragment
            ):
                return "unsupported"
        if (
            self.kind == "text"
            and "/" in model
            and model.split("/", 1)[0] not in provider_list
        ):
            return "unsupported"
        # Keyless is intentional and endpoint-bound; never infer it from a missing key.
        if self.keyless:
            # Only the explicit OpenAI route has a checked endpoint/key contract
            # in locked LiteLLM 1.83.3. provider_list is NOT an auth guarantee.
            if self.kind == "text" and not model.startswith("openai/"):
                return "unsupported"
            if not self.base_url:
                return "incomplete"
        elif not self.api_key:
            return "incomplete"
        return "configured"

    @property
    def is_configured(self) -> bool:
        return self.configuration_status == "configured"

    @property
    def dispatch_api_key(self) -> str:
        if not self.is_configured:
            raise CapabilityUnavailableError(self.disclosure().message)
        # An explicit non-secret sentinel prevents SDK environment-key fallback.
        return "tarnished-keyless" if self.keyless else self.api_key or ""

    def disclosure(self) -> CapabilityResponse:
        status = self.configuration_status
        model = self.effective_model
        safe_model = (
            model
            if model and IDENTIFIER.fullmatch(model) and "://" not in model
            else None
        )
        provider = (
            self.provider
            if self.kind == "speech"
            else (
                safe_model.split("/", 1)[0]
                if safe_model and "/" in safe_model
                else "litellm"
            )
        )
        if provider and (not IDENTIFIER.fullmatch(provider) or "://" in provider):
            provider = None
        messages = {
            "disabled": "Disabled by the administrator. Ask an administrator to enable this capability.",
            "incomplete": "Configuration is incomplete. Ask an administrator to set the model and credential, or explicitly select keyless with an endpoint.",
            "unsupported": "The configured model or keyless route is unsupported. Keyless text requires an explicit openai/ model and endpoint. Ask an administrator to correct it.",
            "configured": "Structurally configured, unverified. Provider compatibility and availability have not been tested.",
        }
        message = messages[status]
        if self.kind == "speech":
            message += " Speech uses audio/transcriptions JSON: openai with an unprefixed cloud/custom model, or local with a curated English model and a private keyless endpoint. Configuration is not proof of installation or inference readiness."
        return CapabilityResponse(
            enabled=self.enabled,
            provider=provider,
            model=safe_model,
            configuration_status=status,
            configuration_revision=self.revision,
            dispatch_supported=self.kind == "text"
            or (
                (
                    self.provider == "openai"
                    and bool(safe_model)
                    and "/" not in safe_model
                )
                or (self.provider == "local" and safe_model in LOCAL_MODELS)
            ),
            available=self.is_configured,
            external_processing=(
                "Local speech runs on the Tarnished host, not your browser or computer when Tarnished is remote. The operator must isolate the service; model setup downloads contact GHCR/Hugging Face. Text analysis is configured separately."
                if self.kind == "speech" and self.provider == "local"
                else "Requested inputs are sent to the administrator-configured service, which may be external. Locality is not verified."
            ),
            input_disclosure="Job posting text or analytics aggregates, only on request."
            if self.kind == "text"
            else "On explicit request, every audio track/channel is sent in bounded WAV chunks (up to 832 requests for the maximum track/channel target). No video frames, profile or other records are sent. Speech segment times are kept when available. The transcript is then sent to the configured text analysis service to assign parts and roles automatically; if unavailable, roles remain unknown.",
            message=message,
        )


@dataclass(slots=True)
class AISettingsState(CapabilitySettingsState):
    speech: CapabilitySettingsState = field(
        default_factory=lambda: CapabilitySettingsState(
            None, None, None, enabled=False, kind="speech"
        )
    )

    def admin_response(self) -> AISettingsResponse:
        return AISettingsResponse(
            litellm_model=self.disclosure().model if self.model else None,
            litellm_api_key_masked=self.masked_api_key,
            litellm_endpoint_configured=bool(self.base_url),
            is_configured=self.is_configured,
            text_protocol="responses"
            if self.protocol == "responses"
            else "chat_completions",
            text_enabled=self.enabled,
            text_keyless=self.keyless,
            speech_enabled=self.speech.enabled,
            speech_keyless=self.speech.keyless,
            speech_provider=self.speech.disclosure().provider,
            speech_model=self.speech.disclosure().model,
            speech_endpoint_configured=bool(self.speech.base_url),
            speech_api_key_configured=bool(self.speech.api_key),
            text=self.disclosure(),
            speech=self.speech.disclosure(),
        )


def _settings_to_state(values: dict[str, str | None]) -> AISettingsState:
    values = DEFAULTS | values

    def secret(key: str) -> str | None:
        encrypted = values.get(key)
        return decrypt_api_key(encrypted) if encrypted else None

    return AISettingsState(
        model=values.get("litellm_model"),
        api_key=secret("litellm_api_key"),
        base_url=values.get("litellm_base_url"),
        enabled=values["text_enabled"] == "true",
        keyless=values["text_keyless"] == "true",
        revision=values.get("text_revision") or "0",
        protocol="responses"
        if values.get("text_protocol") == "responses"
        else "chat_completions",
        speech=CapabilitySettingsState(
            model=values.get("speech_model"),
            api_key=secret("speech_api_key"),
            base_url=values.get("speech_endpoint"),
            enabled=values["speech_enabled"] == "true",
            keyless=values["speech_keyless"] == "true",
            revision=values.get("speech_revision") or "0",
            provider=values.get("speech_provider"),
            kind="speech",
        ),
    )


def _snapshot_query():
    # One SQL statement, not ORM identity-map values or separate capability reads.
    return select(SystemSettings.key, SystemSettings.value).where(
        SystemSettings.key.in_(AI_SETTINGS_KEYS)
    )


async def get_ai_settings(db: AsyncSession) -> AISettingsState:
    return _settings_to_state(dict((await db.execute(_snapshot_query())).all()))


async def lock_ai_settings(db: AsyncSession) -> None:
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    # One persistent row serializes settings changes on both database engines.
    await db.execute(
        insert(SystemSettings)
        .values(key=LOCK_KEY, value="lock")
        .on_conflict_do_nothing(index_elements=["key"])
    )
    await db.execute(
        update(SystemSettings)
        .where(SystemSettings.key == LOCK_KEY)
        .values(value="lock")
    )


async def update_ai_settings(
    db: AsyncSession, data: AISettingsUpdate
) -> AISettingsState:
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    await lock_ai_settings(db)
    values = dict((await db.execute(_snapshot_query())).all())
    changed = set()
    changes = data.model_dump(exclude_unset=True)
    # Local mode never retains a cloud credential, including partial API updates.
    if changes.get("speech_provider", values.get("speech_provider")) == "local":
        changes["speech_api_key"] = None
    for key, value in changes.items():
        current = values.get(key, DEFAULTS.get(key))
        encoded = str(value).lower() if isinstance(value, bool) else value
        if key in {"litellm_api_key", "speech_api_key"}:
            current = decrypt_api_key(current) if current else None
        if current == encoded and not (
            key in {"litellm_api_key", "speech_api_key"}
            and encoded is None
            and values.get(key)
        ):
            continue
        # Preserve the supplied representation (including explicit default/clear),
        # but default model spelling alone does not change effective dispatch.
        if key != "litellm_model" or (current or DEFAULT_TEXT_MODEL) != (
            encoded or DEFAULT_TEXT_MODEL
        ):
            changed.add("text" if key in TEXT_KEYS else "speech")
        if key in {"litellm_api_key", "speech_api_key"}:
            encoded = encrypt_api_key(str(value)) if value else None
        values[key] = encoded
        stmt = insert(SystemSettings).values(key=key, value=encoded)
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=["key"], set_={"value": stmt.excluded.value}
            )
        )
    for capability in changed:
        key, revision = capability + "_revision", str(uuid4())
        values[key] = revision
        stmt = insert(SystemSettings).values(key=key, value=revision)
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=["key"], set_={"value": stmt.excluded.value}
            )
        )
    snapshot = _settings_to_state(values)
    await db.commit()
    return snapshot
