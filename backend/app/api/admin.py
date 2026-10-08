from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, require_api_key_scope
from app.core.security import get_password_hash
from app.models import Application, ApplicationStatus, RoundType, User
from app.schemas.admin import (
    AdminRoundTypeUpdate,
    AdminStatsResponse,
    AdminStatusUpdate,
    AdminUserCreate,
    AdminUserListResponse,
    AdminUserResponse,
    AdminUserUpdate,
)
from app.services.accounts import update_account
from app.services.reference_data import (
    find_global_round_type_by_name,
    find_global_status_by_name,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    query: str | None = Query(None, min_length=1),
    state: Literal["all", "pending", "active", "inactive"] = "all",
    _: User = Depends(get_current_admin),
    __: object = Depends(require_api_key_scope("admin:read")),
    db: AsyncSession = Depends(get_db),
):
    normalized_query = query.strip() if query else None

    count_query = select(func.count(User.id))
    users_query = (
        select(
            User,
            func.count(Application.id).label("app_count"),
        )
        .outerjoin(Application)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )

    if normalized_query:
        email_filter = User.email.ilike(f"%{normalized_query}%")
        count_query = count_query.where(email_filter)
        users_query = users_query.where(email_filter)

    if state != "all":
        predicate = (
            User.approval_pending.is_(True)
            if state == "pending"
            else (
                User.is_active.is_(True)
                if state == "active"
                else (User.is_active.is_(False) & User.approval_pending.is_(False))
            )
        )
        count_query = count_query.where(predicate)
        users_query = users_query.where(predicate)

    # Get total count
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Calculate total pages
    total_pages = (total + per_page - 1) // per_page if total > 0 else 1

    # Get paginated users with application counts
    offset = (page - 1) * per_page
    result = await db.execute(users_query.offset(offset).limit(per_page))
    rows = result.all()

    items = [
        AdminUserResponse(
            id=user.id,
            email=user.email,
            is_admin=user.is_admin,
            is_active=user.is_active,
            created_at=user.created_at,
            application_count=app_count,
            approval_pending=user.approval_pending,
            last_login_at=user.last_login_at,
        )
        for user, app_count in rows
    ]

    return AdminUserListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    data: AdminUserUpdate,
    admin: User = Depends(get_current_admin),
    _: object = Depends(require_api_key_scope("admin:write")),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify your own account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    update_data = data.model_dump(exclude_unset=True)

    if update_data and not await update_account(db, user_id, **update_data):
        raise HTTPException(status_code=404, detail="User not found")
    await db.commit()
    await db.refresh(user)

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
        approval_pending=user.approval_pending,
        last_login_at=user.last_login_at,
    )


@router.post(
    "/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED
)
async def create_user(
    user_data: AdminUserCreate,
    admin: User = Depends(get_current_admin),
    _: object = Depends(require_api_key_scope("admin:write")),
    db: AsyncSession = Depends(get_db),
):
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create new user with hashed password
    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        is_admin=user_data.is_admin,
        is_active=user_data.is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        application_count=0,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    admin: User = Depends(get_current_admin),
    _: object = Depends(require_api_key_scope("admin:write")),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    try:
        # Reuse the owner-scoped workspace clearing order, including converted leads.
        # CAS blobs remain for reference-aware maintenance, never unlinked here.
        from app.services.accounts import delete_account

        await delete_account(db, user_id)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail="User workspace has dependent records"
        ) from None


@router.get("/stats", response_model=AdminStatsResponse)
async def get_stats(
    _: User = Depends(get_current_admin),
    __: object = Depends(require_api_key_scope("admin:read")),
    db: AsyncSession = Depends(get_db),
):
    total_users = await db.execute(select(func.count(User.id)))
    active_users = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )
    total_apps = await db.execute(select(func.count(Application.id)))

    first_of_month = date.today().replace(day=1)
    month_apps = await db.execute(
        select(func.count(Application.id)).where(
            Application.applied_at >= first_of_month
        )
    )

    return AdminStatsResponse(
        pending_users=await db.scalar(
            select(func.count(User.id)).where(User.approval_pending.is_(True))
        )
        or 0,
        total_users=total_users.scalar() or 0,
        active_users=active_users.scalar() or 0,
        total_applications=total_apps.scalar() or 0,
        applications_this_month=month_apps.scalar() or 0,
    )


@router.patch("/statuses/{status_id}")
async def update_default_status(
    status_id: str,
    data: AdminStatusUpdate,
    _: User = Depends(get_current_admin),
    __: object = Depends(require_api_key_scope("admin:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationStatus).where(
            ApplicationStatus.id == status_id,
            ApplicationStatus.is_default == True,
            ApplicationStatus.user_id.is_(None),
        )
    )
    status_obj = result.scalars().first()

    if not status_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Default status not found"
        )

    update_data = data.model_dump(exclude_unset=True)
    if data.name is not None:
        existing_status = await find_global_status_by_name(
            db, data.name, exclude_id=status_obj.id
        )
        if existing_status is not None:
            raise HTTPException(status_code=409, detail="Status name already exists")
    for key, value in update_data.items():
        setattr(status_obj, key, value)

    await db.commit()
    await db.refresh(status_obj)
    return status_obj


@router.patch("/round-types/{round_type_id}")
async def update_default_round_type(
    round_type_id: str,
    data: AdminRoundTypeUpdate,
    _: User = Depends(get_current_admin),
    __: object = Depends(require_api_key_scope("admin:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoundType).where(
            RoundType.id == round_type_id, RoundType.is_default == True
        )
    )
    round_type = result.scalars().first()

    if not round_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Default round type not found"
        )

    update_data = data.model_dump(exclude_unset=True)
    if data.name is not None:
        existing_round_type = await find_global_round_type_by_name(
            db, data.name, exclude_id=round_type.id
        )
        if existing_round_type is not None:
            raise HTTPException(
                status_code=409, detail="Round type name already exists"
            )
    for key, value in update_data.items():
        setattr(round_type, key, value)

    await db.commit()
    await db.refresh(round_type)
    return round_type
