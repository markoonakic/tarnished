from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, field_validator

from app.core.security import validate_new_password
from app.schemas.api_keys import UserAPIKeyResponse

NewPassword = Annotated[str, AfterValidator(validate_new_password)]


class PasswordChange(BaseModel):
    current_password: str
    new_password: NewPassword


class UserSetup(BaseModel):
    email: EmailStr
    password: NewPassword


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    display_name: str | None = None
    can_delete_account: bool = True
    approval_pending: bool = False
    last_login_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    is_admin: bool
    is_active: bool

    @field_validator("last_login_at")
    @classmethod
    def utc_last_login(cls, value):
        return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value


class AuthWhoAmIResponse(BaseModel):
    id: str
    email: str
    is_admin: bool
    is_active: bool
    auth_method: Literal["jwt", "api_key"]
    api_key: UserAPIKeyResponse | None
