from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models import User

security = HTTPBearer()


async def get_current_user(
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


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    """Require admin privileges on the current user."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
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
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate user via API token from Authorization header or X-API-Key header.

    This dependency is used for browser extension API requests. The API token
    can be provided either as a Bearer token in the Authorization header or
    directly in the X-API-Key header.

    Args:
        authorization: Optional Authorization header (Bearer token).
        x_api_key: Optional X-API-Key header.
        db: Database session dependency.

    Returns:
        The authenticated User.

    Raises:
        HTTPException: 401 if no token provided or token is invalid.
    """
    # Extract token from either Authorization Bearer or X-API-Key header
    api_token = None

    if authorization and authorization.startswith("Bearer "):
        api_token = authorization[7:]  # Remove "Bearer " prefix
    elif x_api_key:
        api_token = x_api_key

    if not api_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API token required",
        )

    # Look up user by API token
    result = await db.execute(select(User).where(User.api_token == api_token))
    user = result.scalars().first()

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
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate user via either JWT Bearer token or API key.

    This combined dependency supports both web app authentication (JWT Bearer token)
    and browser extension authentication (API key via X-API-Key header).

    Authentication methods (tried in order):
    1. JWT Bearer token from Authorization header (web app)
    2. API key from X-API-Key header (extension)
    3. API key from Authorization header as Bearer token (extension alternative)

    Args:
        credentials: Optional Bearer token credentials from HTTPBearer.
        authorization: Optional raw Authorization header.
        x_api_key: Optional X-API-Key header.
        db: Database session dependency.

    Returns:
        The authenticated User.

    Raises:
        HTTPException: 401 if authentication fails.
    """
    # Method 1: Try JWT Bearer token authentication (web app)
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
                    return user

    # Method 2 & 3: Try API key authentication (extension)
    api_token = None
    if x_api_key:
        api_token = x_api_key
    elif authorization and authorization.startswith("Bearer "):
        api_token = authorization[7:]

    if api_token:
        result = await db.execute(select(User).where(User.api_token == api_token))
        user = result.scalars().first()
        if user:
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is disabled",
                )
            return user

    # No valid authentication found
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )
