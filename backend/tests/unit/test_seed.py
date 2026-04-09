from sqlalchemy import select

import pytest

from app.core.seed import DEFAULT_ROUND_TYPES, DEFAULT_STATUSES, seed_defaults
from app.models import ApplicationStatus, RoundType


@pytest.mark.asyncio
async def test_seed_defaults_fills_partial_default_data_without_duplicates(db):
    db.add(
        ApplicationStatus(
            name="Applied",
            color="#83a598",
            is_default=True,
            user_id=None,
            order=0,
        )
    )
    await db.commit()

    await seed_defaults(db)
    await seed_defaults(db)

    status_rows = (
        await db.execute(
            select(ApplicationStatus).where(ApplicationStatus.user_id.is_(None))
        )
    ).scalars().all()
    round_type_rows = (
        await db.execute(select(RoundType).where(RoundType.user_id.is_(None)))
    ).scalars().all()

    assert sorted(status.name for status in status_rows) == sorted(
        status["name"] for status in DEFAULT_STATUSES
    )
    assert sorted(round_type.name for round_type in round_type_rows) == sorted(
        DEFAULT_ROUND_TYPES
    )
