from pydantic import BaseModel, Field


class StatusCreate(BaseModel):
    name: str
    color: str = "#83a598"


class StatusUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class StatusFullResponse(BaseModel):
    id: str
    name: str
    color: str
    is_default: bool
    order: int

    class Config:
        from_attributes = True


class RoundTypeCreate(BaseModel):
    name: str


class RoundTypeFullResponse(BaseModel):
    id: str
    name: str
    is_default: bool

    class Config:
        from_attributes = True


class APIKeyResponse(BaseModel):
    """Response schema for the user's API key status.

    Returns whether the user has an API token set, and if so,
    a masked version showing only the first and last few characters.
    When regenerating, the full key is returned once.
    """

    has_api_key: bool = Field(description="Whether the user has an API key configured")
    api_key_masked: str | None = Field(
        default=None,
        description="Masked API key showing first 4 and last 4 characters (e.g., 'abcd...wxyz')",
    )
    api_key_full: str | None = Field(
        default=None,
        description="Full API key (only returned when regenerating, shown once)",
    )

    class Config:
        from_attributes = True


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
