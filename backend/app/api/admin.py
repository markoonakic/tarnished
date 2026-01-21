from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models import Application, ApplicationStatus, RoundType, User
from app.schemas.admin import (
    AdminRoundTypeUpdate,
    AdminStatsResponse,
    AdminStatusUpdate,
    AdminUserResponse,
    AdminUserUpdate,
)
from app.schemas.application import ApplicationListResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            User,
            func.count(Application.id).label("app_count"),
        )
        .outerjoin(Application)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )
    rows = result.all()

    return [
        AdminUserResponse(
            id=user.id,
            email=user.email,
            is_admin=user.is_admin,
            is_active=user.is_active,
            created_at=user.created_at,
            application_count=app_count,
        )
        for user, app_count in rows
    ]


@router.put("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    data: AdminUserUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    await db.commit()

    count_result = await db.execute(
        select(func.count(Application.id)).where(Application.user_id == user_id)
    )
    app_count = count_result.scalar() or 0

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        application_count=app_count,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)
    await db.commit()


@router.get("/stats", response_model=AdminStatsResponse)
async def get_stats(
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = await db.execute(select(func.count(User.id)))
    active_users = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )
    total_apps = await db.execute(select(func.count(Application.id)))

    first_of_month = date.today().replace(day=1)
    month_apps = await db.execute(
        select(func.count(Application.id)).where(Application.applied_at >= first_of_month)
    )

    return AdminStatsResponse(
        total_users=total_users.scalar() or 0,
        active_users=active_users.scalar() or 0,
        total_applications=total_apps.scalar() or 0,
        applications_this_month=month_apps.scalar() or 0,
    )


@router.get("/applications", response_model=ApplicationListResponse)
async def list_all_applications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Application).options(selectinload(Application.status))

    count_result = await db.execute(select(func.count(Application.id)))
    total = count_result.scalar() or 0

    query = query.order_by(Application.applied_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    applications = result.scalars().all()

    return ApplicationListResponse(
        items=applications,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.put("/statuses/{status_id}")
async def update_default_status(
    status_id: str,
    data: AdminStatusUpdate,
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationStatus).where(
            ApplicationStatus.id == status_id, ApplicationStatus.is_default == True
        )
    )
    status_obj = result.scalars().first()

    if not status_obj:
        raise HTTPException(status_code=404, detail="Default status not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(status_obj, key, value)

    await db.commit()
    await db.refresh(status_obj)
    return status_obj


@router.put("/round-types/{round_type_id}")
async def update_default_round_type(
    round_type_id: str,
    data: AdminRoundTypeUpdate,
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoundType).where(
            RoundType.id == round_type_id, RoundType.is_default == True
        )
    )
    round_type = result.scalars().first()

    if not round_type:
        raise HTTPException(status_code=404, detail="Default round type not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(round_type, key, value)

    await db.commit()
    await db.refresh(round_type)
    return round_type
