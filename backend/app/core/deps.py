from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token, hash_api_key
from app.models.user import User
from app.models.user_api_key import UserAPIKey

security = HTTPBearer()


@dataclass(slots=True)
class AuthContext:
    user: User
    auth_method: str
    api_key: UserAPIKey | None = None


async def _get_api_key_and_user(
    raw_api_key: str,
    db: AsyncSession,
) -> tuple[UserAPIKey | None, User | None]:  # pyright: ignore[reportGeneralTypeIssues]
    hashed_key = hash_api_key(raw_api_key)
    result = await db.execute(
        select(UserAPIKey, User)
        .join(User, User.id == UserAPIKey.user_id)
        .where(
            UserAPIKey.key_hash == hashed_key,
            UserAPIKey.revoked_at.is_(None),
        )
    )
    row = result.first()
    if row is None:
        return None, None

    api_key, user = row
    api_key.last_used_at = datetime.now(UTC)
    await db.flush()
    return api_key, user


async def get_current_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    if credentials:
        payload = decode_token(credentials.credentials)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")
            if user_id:
                result = await db.execute(select(User).where(User.id == user_id))
                user = result.scalars().first()
                if user:
                    if not user.is_active:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="User account is disabled",
                        )
                    return AuthContext(user=user, auth_method="jwt")

    if x_api_key:
        api_key, user = await _get_api_key_and_user(x_api_key, db)
        if user:
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is disabled",
                )
            return AuthContext(user=user, auth_method="api_key", api_key=api_key)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


def require_api_key_scope(scope: str):
    async def dependency(
        auth: AuthContext = Depends(get_current_auth_context),
    ) -> AuthContext:
        if (
            auth.auth_method == "api_key"
            and auth.api_key
            and scope not in auth.api_key.scopes
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key lacks required scope: {scope}",
            )
        return auth

    return dependency


def require_api_key_scopes(*scopes: str):
    async def dependency(
        auth: AuthContext = Depends(get_current_auth_context),
    ) -> AuthContext:
        if auth.auth_method == "api_key" and auth.api_key:
            missing = [scope for scope in scopes if scope not in auth.api_key.scopes]
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"API key lacks required scopes: {', '.join(missing)}",
                )
        return auth

    return dependency


async def get_current_user_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from the Bearer token."""
    token = credentials.credentials
    payload = decode_token(token)

    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


async def get_current_user_optional_flexible(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User | None:  # pyright: ignore[reportGeneralTypeIssues]
    if credentials:
        payload = decode_token(credentials.credentials)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")
            if user_id:
                result = await db.execute(select(User).where(User.id == user_id))
                user = result.scalars().first()
                if user and user.is_active:
                    return user

    if x_api_key:
        _api_key, user = await _get_api_key_and_user(x_api_key, db)
        if user and user.is_active:
            return user

    return None


async def get_current_user_flexible(
    auth: AuthContext = Depends(get_current_auth_context),
) -> User:
    """Authenticate user via either JWT Bearer token or API key."""
    return auth.user


async def get_current_admin_flexible(
    user: User = Depends(get_current_user_flexible),
) -> User:
    """Require admin privileges on the current user."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


# Shared API routes accept either JWT or API key.
get_current_user = get_current_user_flexible
get_current_admin = get_current_admin_flexible
