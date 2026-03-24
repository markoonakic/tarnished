"""Tests for insights API endpoints.

Tests for:
- AI configuration status endpoint
- Insights generation endpoint
- Error handling when AI not configured
"""

import os
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import SystemSettings, User
from app.schemas.insights import GraceInsights, SectionInsight

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    """Create a regular test user."""
    user = User(
        email="insights_test@example.com",
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
    """Create Bearer token auth headers for a regular user."""
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# Tests
# ============================================================================


class TestInsightsConfiguredEndpoint:
    """Tests for GET /api/insights/configured."""

    @pytest.mark.asyncio
    async def test_configured_returns_false_when_no_api_key(
        self, client: AsyncClient, test_user: User, auth_headers: dict[str, str]
    ):
        """Test that configured returns False when no API key is set."""
        response = await client.get(
            "/api/analytics/insights/configured", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is False

    @pytest.mark.asyncio
    async def test_configured_returns_true_when_api_key_set(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test that configured returns True when API key is set."""
        from app.core.security import encrypt_api_key

        # Add encrypted API key to settings
        encrypted_key = encrypt_api_key("test-api-key")
        setting = SystemSettings(
            key=SystemSettings.KEY_LITELLM_API_KEY, value=encrypted_key
        )
        db.add(setting)
        await db.commit()

        response = await client.get(
            "/api/analytics/insights/configured", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is True


class TestInsightsGenerationEndpoint:
    """Tests for POST /api/insights."""

    @pytest.mark.asyncio
    async def test_insights_returns_400_when_ai_not_configured(
        self, client: AsyncClient, test_user: User, auth_headers: dict[str, str]
    ):
        """Test that insights returns 400 when AI is not configured."""
        response = await client.post(
            "/api/analytics/insights", json={"period": "30d"}, headers=auth_headers
        )
        assert response.status_code == 400
        assert "AI not configured" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_insights_generates_successfully_with_ai_configured(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test that insights are generated when AI is configured."""
        from app.core.security import encrypt_api_key

        # Add encrypted API key to settings
        encrypted_key = encrypt_api_key("test-api-key")
        setting = SystemSettings(
            key=SystemSettings.KEY_LITELLM_API_KEY, value=encrypted_key
        )
        db.add(setting)
        await db.commit()

        # Mock the generate_insights function
        mock_insights = GraceInsights(
            overall_grace="Test guidance",
            pipeline_overview=SectionInsight(
                key_insight="Test insight",
                trend="Upward",
                priority_actions=["Action 1"],
            ),
            interview_analytics=SectionInsight(
                key_insight="Test insight",
                trend="Stable",
                priority_actions=["Action 2"],
            ),
            activity_tracking=SectionInsight(
                key_insight="Test insight",
                trend="Good",
                priority_actions=["Action 3"],
            ),
        )

        with patch("app.api.insights.generate_insights", return_value=mock_insights):
            response = await client.post(
                "/api/analytics/insights", json={"period": "30d"}, headers=auth_headers
            )

        assert response.status_code == 200
        data = response.json()
        assert data["overall_grace"] == "Test guidance"
        assert data["pipeline_overview"]["key_insight"] == "Test insight"

    @pytest.mark.asyncio
    async def test_insights_accepts_all_period_values(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test that insights accepts all valid period values."""
        from app.core.security import encrypt_api_key

        # Add encrypted API key to settings
        encrypted_key = encrypt_api_key("test-api-key")
        setting = SystemSettings(
            key=SystemSettings.KEY_LITELLM_API_KEY, value=encrypted_key
        )
        db.add(setting)
        await db.commit()

        mock_insights = GraceInsights(
            overall_grace="Test",
            pipeline_overview=SectionInsight(
                key_insight="Test", trend="Test", priority_actions=[]
            ),
            interview_analytics=SectionInsight(
                key_insight="Test", trend="Test", priority_actions=[]
            ),
            activity_tracking=SectionInsight(
                key_insight="Test", trend="Test", priority_actions=[]
            ),
        )

        with patch("app.api.insights.generate_insights", return_value=mock_insights):
            for period in ["7d", "30d", "3m", "all"]:
                response = await client.post(
                    "/api/analytics/insights",
                    json={"period": period},
                    headers=auth_headers,
                )
                assert response.status_code == 200, f"Failed for period {period}"

    @pytest.mark.asyncio
    async def test_insights_requires_authentication(self, client: AsyncClient):
        """Test that insights endpoint requires authentication."""
        response = await client.post("/api/analytics/insights", json={"period": "30d"})
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_insights_preserves_http_exceptions(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """HTTP exceptions from lower layers should not be wrapped as generic 500s."""
        from fastapi import HTTPException

        with patch(
            "app.api.insights._get_analytics_for_insights",
            side_effect=HTTPException(status_code=503, detail="Analytics unavailable"),
        ):
            response = await client.post(
                "/api/analytics/insights", json={"period": "30d"}, headers=auth_headers
            )

        assert response.status_code == 503
        assert response.json()["detail"] == "Analytics unavailable"


class TestInsightsWithPostgreSQL:
    """Tests specifically for PostgreSQL compatibility.

    These tests verify that the insights endpoint works correctly
    when using PostgreSQL (not just SQLite). This is important because
    the original bug only manifested in PostgreSQL mode.

    Run with: cd backend && uv run pytest tests/test_insights.py::TestInsightsWithPostgreSQL -v
    Requires: PostgreSQL running and DATABASE_URL set to postgresql+asyncpg://...
    """

    @pytest.mark.asyncio
    @pytest.mark.skipif(
        "postgresql" not in os.environ.get("TEST_DATABASE_URL", ""),
        reason="Requires PostgreSQL test database. Set TEST_DATABASE_URL to a postgresql URL.",
    )
    async def test_insights_with_postgresql_database(
        self,
        client: AsyncClient,
        db: AsyncSession,
        auth_headers: dict[str, str],
    ):
        """Test that insights works with PostgreSQL backend.

        This test verifies the fix for the bug where insights generation
        failed with 'No module named psycopg2' when using PostgreSQL.

        The bug was caused by:
        1. Code tried to replace +asyncpg with +psycopg2 in sync URL
        2. Only psycopg (v3) was installed, not psycopg2

        The fix uses AsyncSession.run_sync() which doesn't need a separate
        sync engine at all.
        """
        from app.core.security import encrypt_api_key

        db_url = os.environ.get("TEST_DATABASE_URL", "")
        assert "postgresql" in db_url, "This test requires PostgreSQL TEST_DATABASE_URL"

        encrypted_key = encrypt_api_key("test-api-key")
        db.add(
            SystemSettings(key=SystemSettings.KEY_LITELLM_API_KEY, value=encrypted_key)
        )
        await db.commit()

        mock_insights = GraceInsights(
            overall_grace="PostgreSQL guidance",
            pipeline_overview=SectionInsight(
                key_insight="Test insight",
                trend="Stable",
                priority_actions=["Action 1"],
            ),
            interview_analytics=SectionInsight(
                key_insight="Test insight",
                trend="Stable",
                priority_actions=["Action 2"],
            ),
            activity_tracking=SectionInsight(
                key_insight="Test insight",
                trend="Stable",
                priority_actions=["Action 3"],
            ),
        )

        with patch("app.api.insights.generate_insights", return_value=mock_insights):
            response = await client.post(
                "/api/analytics/insights",
                json={"period": "30d"},
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert response.json()["overall_grace"] == "PostgreSQL guidance"
