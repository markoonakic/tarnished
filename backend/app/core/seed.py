from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    """Seed default application statuses and round types if none exist."""
    result = await db.execute(select(ApplicationStatus).where(ApplicationStatus.is_default == True))
    if result.scalars().first():
        return

    for status_data in DEFAULT_STATUSES:
        status = ApplicationStatus(
            name=status_data["name"],
            color=status_data["color"],
            order=status_data["order"],
            is_default=True,
            user_id=None,
        )
        db.add(status)

    for name in DEFAULT_ROUND_TYPES:
        round_type = RoundType(name=name, is_default=True, user_id=None)
        db.add(round_type)

    await db.commit()
