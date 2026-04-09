from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.reference_names import normalized_reference_name
from app.models import ApplicationStatus, RoundType

DEFAULT_STATUSES = [
    {"name": "Applied", "color": "#83a598", "order": 0},
    {"name": "Screening", "color": "#fabd2f", "order": 1},
    {"name": "Interviewing", "color": "#fe8019", "order": 2},
    {"name": "Offer", "color": "#b8bb26", "order": 3},
    {"name": "Accepted", "color": "#8ec07c", "order": 4},
    {"name": "Rejected", "color": "#fb4934", "order": 5},
    {"name": "Withdrawn", "color": "#d3869b", "order": 6},
    {"name": "No Reply", "color": "#a89984", "order": 7},
]

DEFAULT_ROUND_TYPES = [
    "Phone Screen",
    "Technical",
    "Behavioral",
    "Take-home",
    "Onsite",
    "Final",
]


async def seed_defaults(db: AsyncSession) -> None:
    """Seed default application statuses and round types if they are missing."""
    existing_statuses = (
        await db.execute(select(ApplicationStatus).where(ApplicationStatus.user_id.is_(None)))
    ).scalars().all()
    existing_status_names = {status.normalized_name for status in existing_statuses}

    for status_data in DEFAULT_STATUSES:
        normalized_name = normalized_reference_name(status_data["name"])
        if normalized_name in existing_status_names:
            continue

        status = ApplicationStatus(
            name=status_data["name"],
            color=status_data["color"],
            order=status_data["order"],
            is_default=True,
            user_id=None,
        )
        db.add(status)
        existing_status_names.add(normalized_name)

    existing_round_types = (
        await db.execute(select(RoundType).where(RoundType.user_id.is_(None)))
    ).scalars().all()
    existing_round_type_names = {
        round_type.normalized_name for round_type in existing_round_types
    }

    for name in DEFAULT_ROUND_TYPES:
        normalized_name = normalized_reference_name(name)
        if normalized_name in existing_round_type_names:
            continue

        round_type = RoundType(name=name, is_default=True, user_id=None)
        db.add(round_type)
        existing_round_type_names.add(normalized_name)

    await db.commit()
