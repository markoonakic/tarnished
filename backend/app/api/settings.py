from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_key_scopes import (
    CUSTOM_PRESET,
    resolve_scopes_for_preset,
)
from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    get_current_user_flexible,
    get_current_user_jwt,
    require_api_key_scope,
)
from app.core.security import generate_api_token, hash_api_key
from app.models import ApplicationStatus, RoundType, User, UserAPIKey
from app.schemas.api_keys import (
    UserAPIKeyCreate,
    UserAPIKeyCreateResponse,
    UserAPIKeyResponse,
    UserAPIKeyUpdate,
)
from app.schemas.settings import (
    RoundTypeCreate,
    RoundTypeFullResponse,
    StatusCreate,
    StatusFullResponse,
    StatusUpdate,
)
from app.services.reference_data import (
    find_user_status_by_name,
    find_visible_round_type_by_name,
    list_visible_round_types,
    list_visible_statuses,
)

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings/api-keys", response_model=list[UserAPIKeyResponse])
async def list_api_keys(
    user: User = Depends(get_current_user_jwt),
    db: AsyncSession = Depends(get_db),
) -> list[UserAPIKey]:
    result = await db.execute(
        select(UserAPIKey)
        .where(UserAPIKey.user_id == user.id)
        .order_by(UserAPIKey.created_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/settings/api-keys",
    response_model=UserAPIKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key(
    data: UserAPIKeyCreate,
    user: User = Depends(get_current_user_jwt),
    db: AsyncSession = Depends(get_db),
) -> UserAPIKeyCreateResponse:
    raw_key = generate_api_token()
    scopes = (
        list(data.scopes or [])
        if data.preset == CUSTOM_PRESET
        else resolve_scopes_for_preset(data.preset)
    )
    api_key = UserAPIKey(
        user_id=user.id,
        label=data.label,
        preset=data.preset,
        scopes=scopes,
        key_prefix=raw_key[:8],
        key_hash=hash_api_key(raw_key),
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return UserAPIKeyCreateResponse(
        id=api_key.id,
        label=api_key.label,
        preset=api_key.preset,
        scopes=api_key.scopes,
        key_prefix=api_key.key_prefix,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        revoked_at=api_key.revoked_at,
        api_key=raw_key,
    )


@router.patch("/settings/api-keys/{api_key_id}", response_model=UserAPIKeyResponse)
async def update_api_key(
    api_key_id: str,
    data: UserAPIKeyUpdate,
    user: User = Depends(get_current_user_jwt),
    db: AsyncSession = Depends(get_db),
) -> UserAPIKey:
    result = await db.execute(
        select(UserAPIKey).where(
            UserAPIKey.id == api_key_id,
            UserAPIKey.user_id == user.id,
        )
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(status_code=404, detail="API key not found")

    if data.label is not None:
        api_key.label = data.label

    if data.preset is not None:
        api_key.preset = data.preset
        api_key.scopes = (
            list(data.scopes or [])
            if data.preset == CUSTOM_PRESET
            else resolve_scopes_for_preset(data.preset)
        )
    elif data.scopes is not None:
        api_key.preset = CUSTOM_PRESET
        api_key.scopes = list(data.scopes)

    await db.commit()
    await db.refresh(api_key)
    return api_key


@router.delete(
    "/settings/api-keys/{api_key_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_api_key(
    api_key_id: str,
    user: User = Depends(get_current_user_jwt),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(UserAPIKey).where(
            UserAPIKey.id == api_key_id,
            UserAPIKey.user_id == user.id,
        )
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.revoked_at = datetime.now(UTC)
    await db.commit()


@router.get("/statuses", response_model=list[StatusFullResponse])
async def list_statuses(
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("statuses:read")),
    db: AsyncSession = Depends(get_db),
):
    return await list_visible_statuses(db, user.id)


@router.post(
    "/statuses", response_model=StatusFullResponse, status_code=status.HTTP_201_CREATED
)
async def create_status(
    data: StatusCreate,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("statuses:write")),
    db: AsyncSession = Depends(get_db),
):
    existing_status = await find_user_status_by_name(db, user.id, data.name)
    if existing_status is not None:
        raise HTTPException(status_code=409, detail="Status name already exists")

    result = await db.execute(
        select(ApplicationStatus.order)
        .where(
            or_(
                ApplicationStatus.user_id == user.id,
                ApplicationStatus.user_id.is_(None),
            )
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
    _: object = Depends(require_api_key_scope("statuses:write")),
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
        existing_override = await find_user_status_by_name(db, user.id, status_obj.name)
        if existing_override is not None:
            if data.color is not None:
                existing_override.color = data.color
            await db.commit()
            await db.refresh(existing_override)
            return existing_override

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
        raise HTTPException(
            status_code=403, detail="Not authorized to edit this status"
        )

    if data.name is not None:
        existing_status = await find_user_status_by_name(
            db, user.id, data.name, exclude_id=status_obj.id
        )
        if existing_status is not None:
            raise HTTPException(status_code=409, detail="Status name already exists")
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
    _: object = Depends(require_api_key_scope("statuses:write")),
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
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this status"
        )

    await db.delete(status_obj)
    await db.commit()


@router.get("/round-types", response_model=list[RoundTypeFullResponse])
async def list_round_types(
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("round_types:read")),
    db: AsyncSession = Depends(get_db),
):
    return await list_visible_round_types(db, user.id)


@router.post(
    "/round-types",
    response_model=RoundTypeFullResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_round_type(
    data: RoundTypeCreate,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("round_types:write")),
    db: AsyncSession = Depends(get_db),
):
    existing_round_type = await find_visible_round_type_by_name(db, user.id, data.name)
    if existing_round_type is not None:
        raise HTTPException(status_code=409, detail="Round type name already exists")

    round_type = RoundType(
        name=data.name,
        is_default=False,
        user_id=user.id,
    )
    db.add(round_type)
    await db.commit()
    await db.refresh(round_type)
    return round_type


@router.patch("/round-types/{round_type_id}", response_model=RoundTypeFullResponse)
async def update_round_type(
    round_type_id: str,
    data: RoundTypeCreate,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("round_types:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RoundType).where(RoundType.id == round_type_id))
    round_type = result.scalar_one_or_none()

    if not round_type:
        raise HTTPException(status_code=404, detail="Round type not found")

    # Only allow editing user-owned round types
    if round_type.user_id is None:
        raise HTTPException(status_code=403, detail="Cannot edit default round types")

    if round_type.user_id != user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to edit this round type"
        )

    if data.name is not None:
        existing_round_type = await find_visible_round_type_by_name(
            db, user.id, data.name
        )
        if existing_round_type is not None and existing_round_type.id != round_type.id:
            raise HTTPException(
                status_code=409, detail="Round type name already exists"
            )
        round_type.name = data.name

    await db.commit()
    await db.refresh(round_type)
    return round_type


@router.delete("/round-types/{round_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_round_type(
    round_type_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("round_types:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RoundType).where(RoundType.id == round_type_id))
    round_type = result.scalar_one_or_none()

    if not round_type:
        raise HTTPException(status_code=404, detail="Round type not found")

    # Only allow deleting user-owned round types
    if round_type.user_id is None:
        raise HTTPException(status_code=403, detail="Cannot delete default round types")

    if round_type.user_id != user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this round type"
        )

    await db.delete(round_type)
    await db.commit()
