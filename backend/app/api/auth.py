from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import (
    AuthContext,
    get_current_auth_context,
    get_current_user_jwt,
    get_session_user,
)
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models import User
from app.schemas.api_keys import UserAPIKeyResponse
from app.schemas.auth import (
    AuthWhoAmIResponse,
    PasswordChange,
    Token,
    TokenRefresh,
    UserLogin,
    UserResponse,
)
from app.services.accounts import needs_owner_setup, update_account

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(
    request: Request, credentials: UserLogin, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalars().first()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    return Token(
        access_token=create_access_token(
            {"sub": user.id, "session_version": user.session_version}
        ),
        refresh_token=create_refresh_token(
            {"sub": user.id, "session_version": user.session_version}
        ),
    )


@router.post("/refresh", response_model=Token)
@limiter.limit("20/minute")
async def refresh_token(
    request: Request, token_data: TokenRefresh, db: AsyncSession = Depends(get_db)
):
    user = await get_session_user(db, decode_token(token_data.refresh_token), "refresh")
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return Token(
        access_token=create_access_token(
            {"sub": user.id, "session_version": user.session_version}
        ),
        refresh_token=create_refresh_token(
            {"sub": user.id, "session_version": user.session_version}
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user_jwt)):
    return user


@router.get("/whoami", response_model=AuthWhoAmIResponse)
async def get_whoami(
    auth: AuthContext = Depends(get_current_auth_context),
) -> AuthWhoAmIResponse:
    return AuthWhoAmIResponse(
        id=auth.user.id,
        email=auth.user.email,
        is_admin=auth.user.is_admin,
        is_active=auth.user.is_active,
        auth_method="api_key" if auth.auth_method == "api_key" else "jwt",
        api_key=(
            UserAPIKeyResponse.model_validate(auth.api_key)
            if auth.api_key is not None
            else None
        ),
    )


@router.get("/setup-status")
async def setup_status(db: AsyncSession = Depends(get_db)):
    return {"needs_setup": await needs_owner_setup(db)}


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    data: PasswordChange,
    user: User = Depends(get_current_user_jwt),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if not await update_account(
        db, user.id, password=data.new_password, expected_version=user.session_version
    ):
        raise HTTPException(status_code=409, detail="Account changed; sign in again")
    await db.commit()


@router.post("/signout-all", status_code=status.HTTP_204_NO_CONTENT)
async def signout_all(
    user: User = Depends(get_current_user_jwt),
    db: AsyncSession = Depends(get_db),
):
    await update_account(db, user.id)
    await db.commit()
