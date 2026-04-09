from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.api_key_scopes import CUSTOM_PRESET, PRESET_SCOPES, is_valid_scope


class UserAPIKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    preset: str
    scopes: list[str]
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class UserAPIKeyCreate(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    preset: str = Field(default="full_access")
    scopes: list[str] | None = None

    @field_validator("preset")
    @classmethod
    def validate_preset(cls, value: str) -> str:
        if value not in PRESET_SCOPES:
            raise ValueError("Invalid API key preset")
        return value

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        invalid = [scope for scope in value if not is_valid_scope(scope)]
        if invalid:
            raise ValueError(f"Invalid API key scopes: {', '.join(invalid)}")
        return value


class UserAPIKeyCreateResponse(UserAPIKeyResponse):
    api_key: str


class UserAPIKeyUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    preset: str | None = None
    scopes: list[str] | None = None

    @field_validator("preset")
    @classmethod
    def validate_preset(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in PRESET_SCOPES:
            raise ValueError("Invalid API key preset")
        return value

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        invalid = [scope for scope in value if not is_valid_scope(scope)]
        if invalid:
            raise ValueError(f"Invalid API key scopes: {', '.join(invalid)}")
        return value
