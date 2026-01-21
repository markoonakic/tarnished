from datetime import datetime

from pydantic import BaseModel


class AdminUserResponse(BaseModel):
    id: str
    email: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    application_count: int = 0

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None


class AdminStatsResponse(BaseModel):
    total_users: int
    active_users: int
    total_applications: int
    applications_this_month: int


class AdminStatusUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    order: int | None = None


class AdminRoundTypeUpdate(BaseModel):
    name: str | None = None
