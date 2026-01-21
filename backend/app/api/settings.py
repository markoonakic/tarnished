from fastapi import APIRouter, Depends, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import ApplicationStatus, RoundType, User
from app.schemas.settings import (
    RoundTypeCreate,
    RoundTypeFullResponse,
    StatusCreate,
    StatusFullResponse,
)

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/statuses", response_model=list[StatusFullResponse])
async def list_statuses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationStatus)
        .where(
            or_(ApplicationStatus.user_id == user.id, ApplicationStatus.user_id.is_(None))
        )
        .order_by(ApplicationStatus.order)
    )
    return result.scalars().all()


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
