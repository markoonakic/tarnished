from pydantic import BaseModel, ConfigDict, field_validator

from app.core.reference_names import normalize_reference_name
from app.schemas.evidence import Meaning


class StatusCreate(BaseModel):
    meaning: Meaning = "unknown"
    name: str
    color: str = "#83a598"

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = normalize_reference_name(value)
        if not normalized:
            raise ValueError("Name cannot be empty")
        return normalized


class StatusUpdate(BaseModel):
    meaning: Meaning | None = None
    name: str | None = None
    color: str | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        normalized = normalize_reference_name(value)
        if not normalized:
            raise ValueError("Name cannot be empty")
        return normalized

    @field_validator("color", "meaning")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        return value


class StatusFullResponse(BaseModel):
    builtin_key: str | None = None
    meaning: Meaning
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    color: str
    is_default: bool
    order: int


class RoundTypeCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = normalize_reference_name(value)
        if not normalized:
            raise ValueError("Name cannot be empty")
        return normalized


class RoundTypeFullResponse(BaseModel):
    builtin_key: str | None = None
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    is_default: bool


class ThemeColors(BaseModel):
    """Resolved color values for extension consumption."""

    bg0: str
    bg1: str
    bg2: str
    bg3: str
    bg4: str
    fg0: str
    fg1: str
    fg2: str
    fg3: str
    fg4: str
    accent: str
    accent_bright: str
    red: str
    green: str


class UserSettingsResponse(BaseModel):
    """Full settings response with resolved colors."""

    theme: str
    accent: str
    colors: ThemeColors


class UserSettingsUpdate(BaseModel):
    """Payload for updating settings."""

    theme: str | None = None
    accent: str | None = None
