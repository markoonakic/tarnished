from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_flexible
from app.core.security import generate_api_token
from app.models import ApplicationStatus, RoundType, User
from app.schemas.settings import (
    APIKeyResponse,
    RoundTypeCreate,
    RoundTypeFullResponse,
    StatusCreate,
    StatusFullResponse,
    StatusUpdate,
)

router = APIRouter(prefix="/api", tags=["settings"])


def _mask_api_token(token: str | None) -> str | None:
    """Mask API token, showing first 4 and last 4 characters.

    Args:
        token: The API token to mask.

    Returns:
        Masked token in format "abcd...wxyz" or None if no token provided.
    """
    if not token:
        return None
    if len(token) <= 8:
        # For short tokens, show first half and last half with ellipsis
        half = len(token) // 2
        return f"{token[:half]}...{token[-half:]}" if half > 0 else "****"
    return f"{token[:4]}...{token[-4:]}"


@router.get("/settings/api-key", response_model=APIKeyResponse)
async def get_api_key(
    user: User = Depends(get_current_user),
) -> APIKeyResponse:
    """Get the current user's API key status.

    Returns whether the user has an API key configured, the masked version
    for display, and the full key for clipboard copying.
    """
    has_api_key = bool(user.api_token)
    api_key_masked = _mask_api_token(user.api_token)

    return APIKeyResponse(
        has_api_key=has_api_key,
        api_key_masked=api_key_masked,
        api_key_full=user.api_token,
    )


@router.post("/settings/api-key/regenerate", response_model=APIKeyResponse)
async def regenerate_api_key(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIKeyResponse:
    """Regenerate the current user's API key.

    Generates a new API token for the user and saves it to the database.
    Returns the FULL token (only time it's shown) and the masked version.
    """
    new_token = generate_api_token()
    user.api_token = new_token
    await db.commit()
    await db.refresh(user)

    return APIKeyResponse(
        has_api_key=True,
        api_key_masked=_mask_api_token(new_token),
        api_key_full=new_token,  # Return full key - only shown once!
    )


@router.get("/statuses", response_model=list[StatusFullResponse])
async def list_statuses(
    user: User = Depends(get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    # Get user's custom statuses first
    user_result = await db.execute(
        select(ApplicationStatus)
        .where(ApplicationStatus.user_id == user.id)
    )
    user_statuses = user_result.scalars().all()
    user_status_names = {s.name for s in user_statuses}

    # Get default statuses, excluding ones user has overridden
    default_result = await db.execute(
        select(ApplicationStatus)
        .where(
            and_(
                ApplicationStatus.user_id.is_(None),
                ApplicationStatus.name.not_in(user_status_names)
            )
        )
    )
    default_statuses = default_result.scalars().all()

    # Merge and sort by order
    all_statuses = list(user_statuses) + list(default_statuses)
    all_statuses.sort(key=lambda s: s.order)
    return all_statuses


@router.post("/statuses", response_model=StatusFullResponse, status_code=status.HTTP_201_CREATED)
async def create_status(
    data: StatusCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationStatus.order)
        .where(
            or_(ApplicationStatus.user_id == user.id, ApplicationStatus.user_id.is_(None))
        )
        .order_by(ApplicationStatus.order.desc())
        .limit(1)
    )
    max_order = result.scalar() or 0

    status_obj = ApplicationStatus(
        name=data.name,
        color=data.color,
        is_default=False,
        user_id=user.id,
        order=max_order + 1,
    )
    db.add(status_obj)
    await db.commit()
    await db.refresh(status_obj)
    return status_obj


@router.patch("/statuses/{status_id}", response_model=StatusFullResponse)
async def update_status(
    status_id: str,
    data: StatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationStatus).where(ApplicationStatus.id == status_id)
    )
    status_obj = result.scalar_one_or_none()

    if not status_obj:
        raise HTTPException(status_code=404, detail="Status not found")

    # If editing a default status, create user override instead
    if status_obj.user_id is None:
        # Create user's personal copy with custom values
        new_status = ApplicationStatus(
            name=status_obj.name,
            color=data.color if data.color is not None else status_obj.color,
            is_default=False,
            user_id=user.id,
            order=status_obj.order,
        )
        db.add(new_status)
        await db.commit()
        await db.refresh(new_status)
        return new_status

    # Update user-owned status
    if status_obj.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this status")

    if data.name is not None:
        status_obj.name = data.name
    if data.color is not None:
        status_obj.color = data.color

    await db.commit()
    await db.refresh(status_obj)
    return status_obj


@router.delete("/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_status(
    status_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationStatus).where(ApplicationStatus.id == status_id)
    )
    status_obj = result.scalar_one_or_none()

    if not status_obj:
        raise HTTPException(status_code=404, detail="Status not found")

    # Only allow deleting user-owned statuses
    if status_obj.user_id is None:
        raise HTTPException(status_code=403, detail="Cannot delete default statuses")

    if status_obj.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this status")

    await db.delete(status_obj)
    await db.commit()


@router.get("/round-types", response_model=list[RoundTypeFullResponse])
async def list_round_types(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoundType).where(
            or_(RoundType.user_id == user.id, RoundType.user_id.is_(None))
        )
    )
    return result.scalars().all()


@router.post("/round-types", response_model=RoundTypeFullResponse, status_code=status.HTTP_201_CREATED)
async def create_round_type(
    data: RoundTypeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    round_type = RoundType(
        name=data.name,
        is_default=False,
        user_id=user.id,
    )
    db.add(round_type)
    await db.commit()
    await db.refresh(round_type)
    return round_type
