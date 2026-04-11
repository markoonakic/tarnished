from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr


class LiveAPIKeyMetadata(BaseModel):
    id: str
    label: str
    preset: str
    scopes: list[str]
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class LiveAuthIdentity(BaseModel):
    id: str
    email: EmailStr
    is_admin: bool
    is_active: bool
    auth_method: Literal["jwt", "api_key"]
    api_key: LiveAPIKeyMetadata | None = None


class AuthDiagnostics(BaseModel):
    profile: str
    base_url: str
    has_stored_api_key: bool
    stored_api_key_prefix: str | None = None
    live_identity: LiveAuthIdentity | None = None
