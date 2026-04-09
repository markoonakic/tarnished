from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.reference_names import normalize_reference_name


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    application_count: int = 0


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    password: str | None = None  # NEW: Optional password reset


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    is_admin: bool = False
    is_active: bool = True


class AdminStatsResponse(BaseModel):
    total_users: int
    active_users: int
    total_applications: int
    applications_this_month: int


class AdminStatusUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    order: int | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = normalize_reference_name(value)
        if not normalized:
            raise ValueError("Name cannot be empty")
        return normalized


class AdminRoundTypeUpdate(BaseModel):
    name: str | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
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
