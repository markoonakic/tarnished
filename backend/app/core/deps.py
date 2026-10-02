from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
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


async def get_session_user(
    db: AsyncSession, payload: dict | None, token_type: str = "access"
) -> User | None:  # pyright: ignore[reportGeneralTypeIssues] # exportable decorator
    """Fresh database authority for every JWT path, including long-lived SSE polls."""
    if not payload or payload.get("type") != token_type:
        return None
    user = await db.scalar(
        select(User)
        .where(User.id == payload["sub"])
        .execution_options(populate_existing=True)
    )
    if user is None or user.session_version != payload["session_version"]:
        return None
    return user


async def recheck_admitted_auth(
    db: AsyncSession,
    user_id: str,
    session_version: int,
    api_key_id: str | None,
) -> AuthContext:
    """Refresh admitted authority without reapplying the original JWT expiry."""
    user = await get_session_user(
        db, {"sub": user_id, "session_version": session_version, "type": "access"}
    )
    if user is None:
        raise HTTPException(401, "Recording upload authority changed")
    if not user.is_active:
        raise HTTPException(403, "User account is disabled")
    api_key = None
    if api_key_id is not None:
        api_key = await db.scalar(
            select(UserAPIKey)
            .where(
                UserAPIKey.id == api_key_id,
                UserAPIKey.user_id == user_id,
                UserAPIKey.revoked_at.is_(None),
            )
            .execution_options(populate_existing=True)
        )
        if api_key is None:
            raise HTTPException(401, "Recording upload authority changed")
    return AuthContext(
        user=user,
        auth_method="api_key" if api_key_id is not None else "jwt",
        api_key=api_key,
    )


async def _get_api_key_and_user(
    raw_api_key: str,
    db: AsyncSession,
) -> tuple[UserAPIKey | None, User | None]:  # pyright: ignore[reportGeneralTypeIssues]
    hashed_key = hash_api_key(raw_api_key)
    # Usage is non-authoritative bookkeeping. Finish its key-row write before
    # request work takes ordered locks; never commit the caller's transaction.
    async with AsyncSession(bind=db.bind) as usage:
        await usage.execute(
            update(UserAPIKey)
            .where(
                UserAPIKey.key_hash == hashed_key,
                UserAPIKey.revoked_at.is_(None),
            )
            .values(last_used_at=datetime.now(UTC))
        )
        await usage.commit()
    # Read authority again after bookkeeping; ordered work also rechecks it under
    # its own locks, so this separate commit cannot authorize a revoked key.
    result = await db.execute(
        select(UserAPIKey, User)
        .join(User, User.id == UserAPIKey.user_id)
        .where(
            UserAPIKey.key_hash == hashed_key,
            UserAPIKey.revoked_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )
    row = result.first()
    if row is None:
        return None, None

    api_key, user = row
    return api_key, user


async def get_current_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    if credentials:
        user = await get_session_user(db, decode_token(credentials.credentials))
        if user:
            if not user.is_active:
                raise HTTPException(status_code=403, detail="User account is disabled")
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


def get_request_time_zone(
    time_zone: Annotated[str | None, Header(alias="Time-Zone")] = None,
    legacy_time_zone: Annotated[str | None, Header(alias="X-Timezone")] = None,
) -> str | None:
    return time_zone or legacy_time_zone


def check_api_key_scope(auth: AuthContext, scope: str) -> None:
    if auth.auth_method == "api_key" and (
        auth.api_key is None or scope not in auth.api_key.scopes
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API key lacks required scope: {scope}",
        )


def require_api_key_scope(scope: str):
    async def dependency(
        auth: AuthContext = Depends(get_current_auth_context),
    ) -> AuthContext:
        check_api_key_scope(auth, scope)
        return auth

    return dependency


def require_api_key_scopes(*scopes: str):
    async def dependency(
        auth: AuthContext = Depends(get_current_auth_context),
    ) -> AuthContext:
        if auth.auth_method == "api_key":
            missing = [
                scope
                for scope in scopes
                if auth.api_key is None or scope not in auth.api_key.scopes
            ]
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
    user = await get_session_user(db, decode_token(credentials.credentials))
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


async def get_current_auth_context_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> AuthContext | None:
    if credentials:
        user = await get_session_user(db, decode_token(credentials.credentials))
        if user and user.is_active:
            return AuthContext(user=user, auth_method="jwt")

    if x_api_key:
        api_key, user = await _get_api_key_and_user(x_api_key, db)
        if user and user.is_active:
            return AuthContext(user=user, auth_method="api_key", api_key=api_key)

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
