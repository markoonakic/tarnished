from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.round_type import RoundType
from app.models.status import ApplicationStatus


def normalize_reference_name(name: str) -> str:
    return " ".join(name.strip().split())


def normalized_name_sql(column):
    return func.lower(func.trim(column))


def _sort_statuses(statuses: Sequence[ApplicationStatus]) -> list[ApplicationStatus]:
    return sorted(
        statuses,
        key=lambda status: (
            status.order,
            normalize_reference_name(status.name).casefold(),
            status.id,
        ),
    )


async def find_user_status_by_name(
    db: AsyncSession, user_id: str, name: str, exclude_id: str | None = None
) -> ApplicationStatus | None:
    normalized_name = normalize_reference_name(name).casefold()
    stmt = select(ApplicationStatus).where(
        ApplicationStatus.user_id == user_id,
        normalized_name_sql(ApplicationStatus.name) == normalized_name,
    )
    if exclude_id is not None:
        stmt = stmt.where(ApplicationStatus.id != exclude_id)
    stmt = stmt.order_by(ApplicationStatus.order.asc(), ApplicationStatus.id.asc())
    result = await db.execute(stmt)
    return result.scalars().first()


async def find_global_status_by_name(
    db: AsyncSession, name: str, exclude_id: str | None = None
) -> ApplicationStatus | None:
    normalized_name = normalize_reference_name(name).casefold()
    stmt = select(ApplicationStatus).where(
        ApplicationStatus.user_id.is_(None),
        normalized_name_sql(ApplicationStatus.name) == normalized_name,
    )
    if exclude_id is not None:
        stmt = stmt.where(ApplicationStatus.id != exclude_id)
    stmt = stmt.order_by(ApplicationStatus.order.asc(), ApplicationStatus.id.asc())
    result = await db.execute(stmt)
    return result.scalars().first()


async def list_visible_statuses(
    db: AsyncSession, user_id: str
) -> list[ApplicationStatus]:
    user_result = await db.execute(
        select(ApplicationStatus).where(ApplicationStatus.user_id == user_id)
    )
    user_statuses = list(user_result.scalars().all())
    user_status_names = {
        normalize_reference_name(status.name).casefold() for status in user_statuses
    }

    default_result = await db.execute(
        select(ApplicationStatus).where(ApplicationStatus.user_id.is_(None))
    )
    default_statuses = [
        status
        for status in default_result.scalars().all()
        if normalize_reference_name(status.name).casefold() not in user_status_names
    ]

    return _sort_statuses([*user_statuses, *default_statuses])


async def get_initial_application_status(
    db: AsyncSession, user_id: str
) -> ApplicationStatus | None:
    visible_statuses = await list_visible_statuses(db, user_id)
    if not visible_statuses:
        return None

    for status in visible_statuses:
        if normalize_reference_name(status.name).casefold() == "applied":
            return status

    return visible_statuses[0]


async def find_visible_status_by_name(
    db: AsyncSession, user_id: str, name: str
) -> ApplicationStatus | None:
    user_status = await find_user_status_by_name(db, user_id, name)
    if user_status is not None:
        return user_status
    return await find_global_status_by_name(db, name)


async def find_user_round_type_by_name(
    db: AsyncSession, user_id: str, name: str, exclude_id: str | None = None
) -> RoundType | None:
    normalized_name = normalize_reference_name(name).casefold()
    stmt = select(RoundType).where(
        RoundType.user_id == user_id,
        normalized_name_sql(RoundType.name) == normalized_name,
    )
    if exclude_id is not None:
        stmt = stmt.where(RoundType.id != exclude_id)
    stmt = stmt.order_by(RoundType.id.asc())
    result = await db.execute(stmt)
    return result.scalars().first()


async def find_global_round_type_by_name(
    db: AsyncSession, name: str, exclude_id: str | None = None
) -> RoundType | None:
    normalized_name = normalize_reference_name(name).casefold()
    stmt = select(RoundType).where(
        RoundType.user_id.is_(None),
        normalized_name_sql(RoundType.name) == normalized_name,
    )
    if exclude_id is not None:
        stmt = stmt.where(RoundType.id != exclude_id)
    stmt = stmt.order_by(RoundType.id.asc())
    result = await db.execute(stmt)
    return result.scalars().first()


async def list_visible_round_types(db: AsyncSession, user_id: str) -> list[RoundType]:
    user_result = await db.execute(select(RoundType).where(RoundType.user_id == user_id))
    user_round_types = list(user_result.scalars().all())
    user_round_type_names = {
        normalize_reference_name(round_type.name).casefold()
        for round_type in user_round_types
    }

    default_result = await db.execute(
        select(RoundType).where(RoundType.user_id.is_(None))
    )
    default_round_types = [
        round_type
        for round_type in default_result.scalars().all()
        if normalize_reference_name(round_type.name).casefold()
        not in user_round_type_names
    ]

    return sorted(
        [*user_round_types, *default_round_types],
        key=lambda round_type: (
            normalize_reference_name(round_type.name).casefold(),
            round_type.id,
        ),
    )


async def find_visible_round_type_by_name(
    db: AsyncSession, user_id: str, name: str
) -> RoundType | None:
    user_round_type = await find_user_round_type_by_name(db, user_id, name)
    if user_round_type is not None:
        return user_round_type
    return await find_global_round_type_by_name(db, name)
