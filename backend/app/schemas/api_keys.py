from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserAPIKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class UserAPIKeyCreate(BaseModel):
    label: str = Field(min_length=1, max_length=255)


class UserAPIKeyCreateResponse(UserAPIKeyResponse):
    api_key: str


class UserAPIKeyUpdate(BaseModel):
    label: str = Field(min_length=1, max_length=255)
