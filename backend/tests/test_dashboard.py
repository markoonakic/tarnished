from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import Application, ApplicationStatus, User
from app.services import user_time


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="dashboard-test@example.com",
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
    token = create_access_token(
        {"sub": test_user.id, "session_version": test_user.session_version}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def set_utc_now(monkeypatch: pytest.MonkeyPatch):
    def _set_utc_now(value: datetime) -> None:
        monkeypatch.setattr(user_time, "_utc_now", lambda: value)

    return _set_utc_now


class TestDashboardKPIs:
    async def test_dashboard_kpis_use_previous_periods_and_safe_zero_baseline(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        today = date.today()
        applied_status = ApplicationStatus(
            name="Applied",
            color="#83a598",
            is_default=True,
            order=1,
        )
        interviewing_status = ApplicationStatus(
            name="Interviewing",
            color="#8ec07c",
            is_default=True,
            order=2,
        )
        rejected_status = ApplicationStatus(
            name="Rejected",
            color="#fb4934",
            is_default=True,
            order=3,
        )
        db.add_all([applied_status, interviewing_status, rejected_status])
        await db.flush()

        applications = [
            Application(
                user_id=test_user.id,
                company="A",
                job_title="Current 1",
                status_id=applied_status.id,
                status_meaning="applied",
                status_meaning_provenance="recorded",
                applied_at=today,
            ),
            Application(
                user_id=test_user.id,
                company="B",
                job_title="Current 2",
                status_id=applied_status.id,
                status_meaning="applied",
                status_meaning_provenance="recorded",
                applied_at=today - timedelta(days=1),
            ),
            Application(
                user_id=test_user.id,
                company="C",
                job_title="Current 3",
                status_id=interviewing_status.id,
                status_meaning="interviewing",
                status_meaning_provenance="recorded",
                applied_at=today - timedelta(days=6),
            ),
            Application(
                user_id=test_user.id,
                company="D",
                job_title="Previous 1",
                status_id=applied_status.id,
                status_meaning="applied",
                status_meaning_provenance="recorded",
                applied_at=today - timedelta(days=7),
            ),
            Application(
                user_id=test_user.id,
                company="E",
                job_title="Previous 2",
                status_id=applied_status.id,
                status_meaning="applied",
                status_meaning_provenance="recorded",
                applied_at=today - timedelta(days=10),
            ),
            Application(
                user_id=test_user.id,
                company="F",
                job_title="Current 30",
                status_id=rejected_status.id,
                status_meaning="rejected",
                status_meaning_provenance="recorded",
                applied_at=today - timedelta(days=20),
            ),
        ]
        db.add_all(applications)
        await db.commit()

        response = await client.get("/api/dashboard/kpis", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload.pop("scope")["basis"] == "applied_date_cohort"
        assert (
            payload.pop("current_record_basis")["basis"]
            == "live_current_records_not_historical_as_of"
        )
        assert payload.pop("unknown_opportunities") == 0
        assert payload == {
            "last_7_days": 3,
            "last_7_days_trend": 50.0,
            "last_30_days": 6,
            "last_30_days_trend": None,
            "active_opportunities": 5,
        }

    async def test_dashboard_kpis_return_zero_percent_for_two_empty_periods(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.get("/api/dashboard/kpis", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload.pop("scope")["basis"] == "applied_date_cohort"
        assert (
            payload.pop("current_record_basis")["basis"]
            == "live_current_records_not_historical_as_of"
        )
        assert payload.pop("unknown_opportunities") == 0
        assert payload == {
            "last_7_days": 0,
            "last_7_days_trend": 0.0,
            "last_30_days": 0,
            "last_30_days_trend": 0.0,
            "active_opportunities": 0,
        }

    async def test_needs_attention_uses_manual_timezone_for_day_boundaries(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        set_utc_now(datetime(2026, 4, 15, 0, 30, tzinfo=UTC))
        test_user.settings = {
            "time_zone_mode": "manual",
            "time_zone": "America/Los_Angeles",
        }

        applied_status = ApplicationStatus(
            name="Applied",
            color="#83a598",
            is_default=True,
            order=1,
        )
        db.add(applied_status)
        await db.flush()

        db.add(
            Application(
                user_id=test_user.id,
                company="Late Night Co",
                job_title="QA Role",
                status_id=applied_status.id,
                status_meaning="applied",
                status_meaning_provenance="recorded",
                applied_at=date(2026, 4, 8),
            )
        )
        await db.commit()

        response = await client.get(
            "/api/dashboard/needs-attention",
            headers={**auth_headers, "X-Timezone": "Europe/Belgrade"},
        )

        assert response.status_code == 200
        assert response.json()["follow_ups"] == []
