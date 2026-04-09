from pydantic import BaseModel, ConfigDict, Field


class StatusCreate(BaseModel):
    name: str
    color: str = "#83a598"


class StatusUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class StatusFullResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    color: str
    is_default: bool
    order: int


class RoundTypeCreate(BaseModel):
    name: str


class RoundTypeFullResponse(BaseModel):
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


class UserSettings(BaseModel):
    """User theme and accent preferences."""

    theme: str | None = None
    accent: str | None = None


class UserSettingsResponse(BaseModel):
    """Full settings response with resolved colors."""

    theme: str
    accent: str
    colors: ThemeColors


class UserSettingsUpdate(BaseModel):
    """Payload for updating settings."""

    theme: str | None = None
    accent: str | None = None
