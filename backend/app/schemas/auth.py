from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.api_keys import UserAPIKeyResponse


class UserCreate(BaseModel):
    email: EmailStr
    password: str


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
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    is_admin: bool
    is_active: bool


class AuthWhoAmIResponse(UserResponse):
    auth_method: Literal["jwt", "api_key"]
    api_key: UserAPIKeyResponse | None
