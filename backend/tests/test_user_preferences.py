import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import User


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="prefs-test@example.com",
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


class TestUserPreferences:
    async def test_get_preferences_includes_timezone_default(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.get("/api/user-preferences", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == {
            "show_streak_stats": True,
            "show_needs_attention": True,
            "show_heatmap": True,
            "time_zone_mode": "device",
            "time_zone": None,
        }

    async def test_update_preferences_persists_valid_timezone(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.put(
            "/api/user-preferences",
            headers=auth_headers,
            json={
                "time_zone_mode": "manual",
                "time_zone": "Europe/Belgrade",
                "show_streak_stats": False,
            },
        )

        assert response.status_code == 200
        assert response.json() == {
            "show_streak_stats": False,
            "show_needs_attention": True,
            "show_heatmap": True,
            "time_zone_mode": "manual",
            "time_zone": "Europe/Belgrade",
        }

        await db.refresh(test_user)
        assert test_user.settings == {
            "show_streak_stats": False,
            "show_needs_attention": True,
            "show_heatmap": True,
            "time_zone_mode": "manual",
            "time_zone": "Europe/Belgrade",
        }

    async def test_time_zone_update_without_mode_defaults_to_manual(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.patch(
            "/api/user-preferences",
            headers=auth_headers,
            json={"time_zone": "America/New_York"},
        )

        assert response.status_code == 200
        assert response.json()["time_zone_mode"] == "manual"
        assert response.json()["time_zone"] == "America/New_York"

        await db.refresh(test_user)
        assert test_user.settings["time_zone_mode"] == "manual"
        assert test_user.settings["time_zone"] == "America/New_York"

    async def test_patch_preferences_preserves_theme_settings(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        test_user.settings = {
            "theme": "dracula",
            "accent": "purple",
        }
        await db.commit()

        response = await client.patch(
            "/api/user-preferences",
            headers=auth_headers,
            json={"show_heatmap": False},
        )

        assert response.status_code == 200
        assert response.json() == {
            "show_streak_stats": True,
            "show_needs_attention": True,
            "show_heatmap": False,
            "time_zone_mode": "device",
            "time_zone": None,
        }

        await db.refresh(test_user)
        assert test_user.settings == {
            "theme": "dracula",
            "accent": "purple",
            "show_streak_stats": True,
            "show_needs_attention": True,
            "show_heatmap": False,
            "time_zone_mode": "device",
            "time_zone": None,
        }

    async def test_update_preferences_rejects_invalid_timezone(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.put(
            "/api/user-preferences",
            headers=auth_headers,
            json={"time_zone": "Mars/Olympus_Mons"},
        )

        assert response.status_code == 422
        assert "Invalid IANA time zone" in response.text
