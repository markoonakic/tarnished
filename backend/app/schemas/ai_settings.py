"""AI Settings schemas for LiteLLM configuration."""

from pydantic import BaseModel, Field, field_validator


class AISettingsUpdate(BaseModel):
    """Schema for updating AI settings (PUT /api/admin/ai-settings)."""

    litellm_model: str | None = Field(
        default=None,
        description="LiteLLM model identifier (e.g., 'gpt-4o', 'claude-3-sonnet')",
    )
    litellm_api_key: str | None = Field(
        default=None,
        description="API key for the LiteLLM provider (will be encrypted)",
    )
    litellm_base_url: str | None = Field(
        default=None,
        description="Base URL for self-hosted LiteLLM instances",
    )

    @field_validator("litellm_model")
    @classmethod
    def validate_model(cls, v: str | None) -> str | None:
        """Ensure model name is not empty if provided."""
        if v is not None and not v.strip():
            raise ValueError("Model name cannot be empty")
        return v

    @field_validator("litellm_api_key")
    @classmethod
    def validate_api_key(cls, v: str | None) -> str | None:
        """Ensure API key is not empty if provided."""
        if v is not None and not v.strip():
            raise ValueError("API key cannot be empty")
        return v

    @field_validator("litellm_base_url")
    @classmethod
    def validate_base_url(cls, v: str | None) -> str | None:
        """Ensure base URL is not empty if provided."""
        if v is not None and not v.strip():
            raise ValueError("Base URL cannot be empty")
        return v


class AISettingsResponse(BaseModel):
    """Schema for AI settings response (GET /api/admin/ai-settings).

    The API key is masked for security - only showing last 4 characters
    if an API key is configured.
    """

    litellm_model: str | None = Field(
        description="Configured LiteLLM model identifier",
    )
    litellm_api_key_masked: str | None = Field(
        description="Masked API key showing only last 4 characters (e.g., '...abcd')",
    )
    litellm_base_url: str | None = Field(
        description="Configured base URL for self-hosted LiteLLM",
    )
    is_configured: bool = Field(
        description="Whether AI settings have been configured with valid credentials",
    )

    class Config:
        from_attributes = True
