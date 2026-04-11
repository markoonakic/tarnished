from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import Application, ApplicationStatus, Round, RoundType, User


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="analytics-test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def statuses(db: AsyncSession) -> dict[str, ApplicationStatus]:
    applied = ApplicationStatus(
        name="Applied",
        color="#8ec07c",
        is_default=True,
        user_id=None,
        order=1,
    )
    interviewing = ApplicationStatus(
        name="Interviewing",
        color="#fe8019",
        is_default=True,
        user_id=None,
        order=2,
    )
    offer = ApplicationStatus(
        name="Offer",
        color="#83a598",
        is_default=True,
        user_id=None,
        order=3,
    )
    db.add_all([applied, interviewing, offer])
    await db.commit()
    for status in [applied, interviewing, offer]:
        await db.refresh(status)
    return {"applied": applied, "interviewing": interviewing, "offer": offer}


@pytest.fixture
async def round_types(db: AsyncSession) -> dict[str, RoundType]:
    phone = RoundType(name="Phone Screen", is_default=True, user_id=None)
    onsite = RoundType(name="Onsite", is_default=True, user_id=None)
    db.add_all([phone, onsite])
    await db.commit()
    for round_type in [phone, onsite]:
        await db.refresh(round_type)
    return {"phone": phone, "onsite": onsite}


class TestInterviewRoundsAnalytics:
    @pytest.mark.asyncio
    async def test_round_type_filter_limits_candidate_progress_to_matching_rounds(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        statuses: dict[str, ApplicationStatus],
        round_types: dict[str, RoundType],
    ) -> None:
        matching_app = Application(
            user_id=test_user.id,
            company="Match Co",
            job_title="Backend Engineer",
            status_id=statuses["interviewing"].id,
            applied_at=date.today() - timedelta(days=14),
        )
        non_matching_app = Application(
            user_id=test_user.id,
            company="Other Co",
            job_title="Platform Engineer",
            status_id=statuses["applied"].id,
            applied_at=date.today() - timedelta(days=10),
        )
        db.add_all([matching_app, non_matching_app])
        await db.commit()
        await db.refresh(matching_app)
        await db.refresh(non_matching_app)

        db.add_all(
            [
                Round(
                    application_id=matching_app.id,
                    round_type_id=round_types["phone"].id,
                    scheduled_at=datetime.now(UTC) - timedelta(days=9),
                    completed_at=datetime.now(UTC) - timedelta(days=8),
                    outcome="Passed",
                ),
                Round(
                    application_id=matching_app.id,
                    round_type_id=round_types["onsite"].id,
                    scheduled_at=datetime.now(UTC) - timedelta(days=5),
                    completed_at=datetime.now(UTC) - timedelta(days=4),
                    outcome="Pending",
                ),
                Round(
                    application_id=non_matching_app.id,
                    round_type_id=round_types["onsite"].id,
                    scheduled_at=datetime.now(UTC) - timedelta(days=3),
                    completed_at=datetime.now(UTC) - timedelta(days=2),
                    outcome="Passed",
                ),
            ]
        )
        await db.commit()

        response = await client.get(
            "/api/analytics/interview-rounds",
            params={"period": "all", "round_type": "Phone Screen"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        payload = response.json()

        assert [item["round"] for item in payload["funnel_data"]] == ["Phone Screen"]
        assert len(payload["candidate_progress"]) == 1
        assert payload["candidate_progress"][0]["candidate_name"] == "Match Co"
        assert payload["candidate_progress"][0]["rounds_completed"] == [
            {
                "round_type": "Phone Screen",
                "outcome": "Passed",
                "completed_at": payload["candidate_progress"][0]["rounds_completed"][0][
                    "completed_at"
                ],
                "days_in_round": 1,
            }
        ]


class TestHeatmapAnalytics:
    @pytest.mark.asyncio
    async def test_heatmap_rolling_mode_handles_leap_day(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        class LeapDay(date):
            @classmethod
            def today(cls):
                return cls(2024, 2, 29)

        with patch("app.api.analytics.date", LeapDay):
            response = await client.get(
                "/api/analytics/heatmap",
                params={"rolling": "true"},
                headers=auth_headers,
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["days"] == []
        assert payload["max_count"] == 0


class TestWeeklyAnalytics:
    @pytest.mark.asyncio
    async def test_weekly_endpoint_groups_applications_and_interviews(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        statuses: dict[str, ApplicationStatus],
    ) -> None:
        db.add_all(
            [
                Application(
                    user_id=test_user.id,
                    company="Week One",
                    job_title="Engineer I",
                    status_id=statuses["applied"].id,
                    applied_at=date.today() - timedelta(days=6),
                ),
                Application(
                    user_id=test_user.id,
                    company="Week Two",
                    job_title="Engineer II",
                    status_id=statuses["interviewing"].id,
                    applied_at=date.today() - timedelta(days=13),
                ),
            ]
        )
        await db.commit()

        response = await client.get(
            "/api/analytics/weekly",
            params={"period": "30d"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload
        assert sum(item["applications"] for item in payload) == 2
        assert sum(item["interviews"] for item in payload) == 1
