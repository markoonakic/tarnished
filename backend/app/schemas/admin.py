from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, StrictBool, field_validator

from app.core.reference_names import normalize_reference_name
from app.schemas.auth import NewPassword
from app.schemas.evidence import Meaning


class AdminUserResponse(BaseModel):
    approval_pending: bool = False
    last_login_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    application_count: int = 0

    @field_validator("last_login_at")
    @classmethod
    def utc_last_login(cls, value):
        return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value


class AdminUserUpdate(BaseModel):
    approval_pending: StrictBool | None = None
    is_active: StrictBool | None = None
    is_admin: StrictBool | None = None
    password: NewPassword | None = None

    @field_validator("password", "is_active", "is_admin", "approval_pending")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        return value


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: NewPassword
    is_admin: StrictBool = False
    is_active: StrictBool = True


class AdminStatsResponse(BaseModel):
    pending_users: int = 0
    total_users: int
    active_users: int
    total_applications: int
    applications_this_month: int


class AdminStatusUpdate(BaseModel):
    meaning: Meaning | None = None
    name: str | None = None
    color: str | None = None
    order: int | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        normalized = normalize_reference_name(value)
        if not normalized:
            raise ValueError("Name cannot be empty")
        return normalized

    @field_validator("color", "order", "meaning")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        return value


class AdminRoundTypeUpdate(BaseModel):
    name: str | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        normalized = normalize_reference_name(value)
        if not normalized:
            raise ValueError("Name cannot be empty")
        return normalized


class AdminUserListResponse(BaseModel):
    items: list[AdminUserResponse]
    total: int
    page: int
    per_page: int
    total_pages: int
