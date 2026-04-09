from datetime import UTC, datetime
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token, hash_api_key
from app.models import User, UserAPIKey

security = HTTPBearer()


@dataclass(slots=True)
class AuthContext:
    user: User
    auth_method: str
    api_key: UserAPIKey | None = None


async def _get_api_key_and_user(
    raw_api_key: str,
    db: AsyncSession,
) -> tuple[UserAPIKey | None, User | None]:
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


async def get_current_api_key_record(
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> UserAPIKey:
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API token required",
        )

    hashed_key = hash_api_key(x_api_key)
    result = await db.execute(
        select(UserAPIKey).where(
            UserAPIKey.key_hash == hashed_key,
            UserAPIKey.revoked_at.is_(None),
        )
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API token",
        )
    return api_key


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
        if auth.auth_method == "api_key" and auth.api_key and scope not in auth.api_key.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key lacks required scope: {scope}",
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


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
    db: AsyncSession = Depends(get_db),
) -> User | None:  # type: ignore[assignment]
    """Get current user if authenticated, None otherwise."""
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalars().first()


async def get_current_user_by_api_token(
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate user via API token from the X-API-Key header.

    This dependency is used for machine-client API requests. API keys are
    accepted only via the dedicated X-API-Key header.

    Args:
        x_api_key: Optional X-API-Key header.
        db: Database session dependency.

    Returns:
        The authenticated User.

    Raises:
        HTTPException: 401 if no token provided or token is invalid.
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API token required",
        )

    _api_key, user = await _get_api_key_and_user(x_api_key, db)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API token",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


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
