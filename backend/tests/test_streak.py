from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import User
from app.services import user_time


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="streak-test@example.com",
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
def set_utc_now(monkeypatch: pytest.MonkeyPatch):
    def _set_utc_now(value: datetime) -> None:
        monkeypatch.setattr(user_time, "_utc_now", lambda: value)

    return _set_utc_now


class TestStreakBehavior:
    async def test_get_streak_returns_dormant_state_for_new_user(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        set_utc_now(datetime(2026, 4, 10, 12, 0, tzinfo=UTC))

        response = await client.get("/api/streak", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == {
            "current_streak": 0,
            "longest_streak": 0,
            "total_activity_days": 0,
            "last_activity_date": None,
            "ember_active": False,
            "state": "dormant",
            "is_recently_extinguished": False,
            "flame_stage": 0,
            "flame_name": "Dormant",
            "flame_art": "",
            "streak_exhausted_at": None,
        }

    async def test_record_activity_same_day_is_idempotent(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        set_utc_now(datetime(2026, 4, 1, 12, 0, tzinfo=UTC))

        first = await client.post("/api/streak/record", headers=auth_headers)
        second = await client.post("/api/streak/record", headers=auth_headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["current_streak"] == 1
        assert second.json()["current_streak"] == 1

        await db.refresh(test_user)
        assert test_user.current_streak == 1
        assert test_user.longest_streak == 1
        assert test_user.total_activity_days == 1
        assert test_user.last_activity_date == date(2026, 4, 1)
        assert test_user.ember_active is False
        assert test_user.streak_exhausted_at is None

    async def test_get_streak_marks_ember_after_one_missed_day(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        set_utc_now(datetime(2026, 4, 1, 12, 0, tzinfo=UTC))
        await client.post("/api/streak/record", headers=auth_headers)

        set_utc_now(datetime(2026, 4, 2, 12, 0, tzinfo=UTC))
        response = await client.get("/api/streak", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload["current_streak"] == 1
        assert payload["ember_active"] is True
        assert payload["state"] == "ember"
        assert payload["is_recently_extinguished"] is False
        assert payload["streak_exhausted_at"] is None

        await db.refresh(test_user)
        assert test_user.current_streak == 1
        assert test_user.ember_active is True
        assert test_user.streak_exhausted_at is None

    async def test_get_streak_extinguishes_after_grace_period_with_exact_date(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        set_utc_now(datetime(2026, 4, 1, 12, 0, tzinfo=UTC))
        await client.post("/api/streak/record", headers=auth_headers)
        set_utc_now(datetime(2026, 4, 2, 12, 0, tzinfo=UTC))
        await client.post("/api/streak/record", headers=auth_headers)

        set_utc_now(datetime(2026, 4, 8, 12, 0, tzinfo=UTC))
        response = await client.get("/api/streak", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload["current_streak"] == 0
        assert payload["longest_streak"] == 2
        assert payload["ember_active"] is False
        assert payload["state"] == "extinguished"
        assert payload["is_recently_extinguished"] is True
        assert payload["flame_stage"] == 0
        assert payload["streak_exhausted_at"] == "2026-04-04"

        await db.refresh(test_user)
        assert test_user.current_streak == 0
        assert test_user.ember_active is False
        assert test_user.streak_start_date is None
        assert test_user.streak_exhausted_at == date(2026, 4, 4)

    async def test_record_after_gap_restarts_streak_without_prior_get(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        set_utc_now(datetime(2026, 4, 1, 12, 0, tzinfo=UTC))
        await client.post("/api/streak/record", headers=auth_headers)
        set_utc_now(datetime(2026, 4, 2, 12, 0, tzinfo=UTC))
        await client.post("/api/streak/record", headers=auth_headers)

        set_utc_now(datetime(2026, 4, 8, 12, 0, tzinfo=UTC))
        response = await client.post("/api/streak/record", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["current_streak"] == 1

        streak_response = await client.get("/api/streak", headers=auth_headers)
        assert streak_response.status_code == 200
        assert streak_response.json()["current_streak"] == 1
        assert streak_response.json()["longest_streak"] == 2
        assert streak_response.json()["total_activity_days"] == 3
        assert streak_response.json()["ember_active"] is False
        assert streak_response.json()["state"] == "burning"
        assert streak_response.json()["streak_exhausted_at"] is None

        await db.refresh(test_user)
        assert test_user.current_streak == 1
        assert test_user.longest_streak == 2
        assert test_user.total_activity_days == 3
        assert test_user.last_activity_date == date(2026, 4, 8)
        assert test_user.streak_start_date == date(2026, 4, 8)
        assert test_user.streak_exhausted_at is None

    async def test_streak_uses_stored_timezone_for_day_boundaries(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        test_user.settings = {"time_zone": "America/Los_Angeles"}
        await db.commit()

        set_utc_now(datetime(2026, 4, 2, 6, 30, tzinfo=UTC))
        await client.post("/api/streak/record", headers=auth_headers)

        await db.refresh(test_user)
        assert test_user.last_activity_date == date(2026, 4, 1)

        set_utc_now(datetime(2026, 4, 3, 6, 30, tzinfo=UTC))
        response = await client.get("/api/streak", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload["state"] == "ember"
        assert payload["last_activity_date"] == "2026-04-01"

    async def test_streak_uses_request_timezone_header_before_persisted_preference(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        set_utc_now(datetime(2026, 4, 2, 6, 30, tzinfo=UTC))
        response = await client.post(
            "/api/streak/record",
            headers={**auth_headers, "X-Timezone": "America/Los_Angeles"},
        )

        assert response.status_code == 200
        await db.refresh(test_user)
        assert test_user.last_activity_date == date(2026, 4, 1)

    async def test_streak_uses_manual_timezone_override_before_request_header(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
        set_utc_now,
    ) -> None:
        test_user.settings = {
            "time_zone_mode": "manual",
            "time_zone": "America/New_York",
        }
        await db.commit()

        set_utc_now(datetime(2026, 4, 2, 6, 30, tzinfo=UTC))
        response = await client.post(
            "/api/streak/record",
            headers={**auth_headers, "X-Timezone": "America/Los_Angeles"},
        )

        assert response.status_code == 200
        await db.refresh(test_user)
        assert test_user.last_activity_date == date(2026, 4, 2)
