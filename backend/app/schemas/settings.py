from typing import Optional

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
    """

    has_api_key: bool = Field(
        description="Whether the user has an API key configured"
    )
    api_key_masked: Optional[str] = Field(
        default=None,
        description="Masked API key showing first 4 and last 4 characters (e.g., 'abcd...wxyz')",
    )

    class Config:
        from_attributes = True
