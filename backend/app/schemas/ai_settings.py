"""Installation capabilities; credentials and endpoints are write-only."""

import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

IDENTIFIER = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$")


class AISettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    litellm_model: str | None = None
    litellm_api_key: str | None = Field(default=None, max_length=8192, repr=False)
    litellm_base_url: str | None = Field(default=None, max_length=2048, repr=False)
    text_protocol: Literal["chat_completions", "responses"] | None = None
    text_enabled: bool = True
    text_keyless: bool = False
    speech_enabled: bool = False
    speech_provider: str | None = None
    speech_model: str | None = None
    speech_endpoint: str | None = Field(default=None, max_length=2048, repr=False)
    speech_api_key: str | None = Field(default=None, max_length=8192, repr=False)
    speech_keyless: bool = False

    @field_validator("litellm_model", "speech_model", "speech_provider")
    @classmethod
    def validate_identifier(cls, value: str | None) -> str | None:
        if value is not None and (not IDENTIFIER.fullmatch(value) or "://" in value):
            raise ValueError("Use a provider/model identifier, not a URL or credential")
        return value

    @field_validator("litellm_api_key", "speech_api_key")
    @classmethod
    def validate_secret(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Credential cannot be empty; use null to clear")
        return value

    @field_validator("litellm_base_url", "speech_endpoint")
    @classmethod
    def validate_endpoint(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                parsed = urlsplit(value)
                valid = parsed.scheme in {"http", "https"} and parsed.hostname
                valid = valid and not any(c.isspace() for c in value)
                _ = parsed.port
            except ValueError:
                valid = False
            if not valid:
                raise ValueError("Endpoint must be an absolute HTTP(S) URL")
        return value


class CapabilityResponse(BaseModel):
    enabled: bool
    provider: str | None
    model: str | None
    configuration_status: Literal["disabled", "incomplete", "unsupported", "configured"]
    configuration_revision: str
    verified: Literal[False] = False
    dispatch_supported: bool
    available: bool = Field(
        description="Whether the installed dispatch path accepts requests; not a live service guarantee"
    )
    external_processing: str
    input_disclosure: str
    message: str


class AISettingsResponse(BaseModel):
    litellm_model: str | None
    # Compatibility names retained, but no secret suffix or stored endpoint is echoed.
    litellm_api_key_masked: str | None
    litellm_base_url: None = None
    litellm_endpoint_configured: bool
    is_configured: bool
    text_protocol: Literal["chat_completions", "responses"]
    text_enabled: bool
    text_keyless: bool
    speech_enabled: bool
    speech_keyless: bool
    speech_provider: str | None
    speech_model: str | None
    speech_endpoint_configured: bool
    speech_api_key_configured: bool
    text: CapabilityResponse
    speech: CapabilityResponse


class CapabilitiesResponse(BaseModel):
    text: CapabilityResponse
    speech: CapabilityResponse
