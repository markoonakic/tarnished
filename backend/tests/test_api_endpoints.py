"""Comprehensive API endpoint tests for Task 8.4.

Tests for:
- Job Leads API (POST, GET, DELETE, retry)
- User Profile API (GET, PUT)
- Settings API (api-key endpoints)
- Admin AI Settings API (GET, PUT)

All tests verify authentication requirements and success/error cases.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    generate_api_token,
    get_password_hash,
)
from app.main import app
from app.models import JobLead, SystemSettings, User
from app.models.user_profile import UserProfile


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    """Create a regular test user."""
    user = User(
        email="test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def admin_user(db: AsyncSession) -> User:
    """Create an admin test user."""
    user = User(
        email="admin@example.com",
        password_hash=get_password_hash("adminpass123"),
        is_admin=True,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def user_with_api_token(db: AsyncSession) -> User:
    """Create a user with an API token set."""
    user = User(
        email="api_user@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
        api_token=generate_api_token(),
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


@pytest.fixture
def admin_auth_headers(admin_user: User) -> dict[str, str]:
    """Create Bearer token auth headers for an admin user."""
    token = create_access_token({"sub": admin_user.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def test_job_lead(db: AsyncSession, test_user: User) -> JobLead:
    """Create a test job lead."""
    job_lead = JobLead(
        user_id=test_user.id,
        url="https://example.com/job/test-123",
        status="extracted",
        title="Software Engineer",
        company="Test Company",
        location="Remote",
        salary_min=100000,
        salary_max=150000,
        salary_currency="USD",
    )
    db.add(job_lead)
    await db.commit()
    await db.refresh(job_lead)
    return job_lead


@pytest.fixture
async def failed_job_lead(db: AsyncSession, test_user: User) -> JobLead:
    """Create a failed job lead for retry testing."""
    job_lead = JobLead(
        user_id=test_user.id,
        url="https://example.com/job/failed-456",
        status="failed",
        error_message="Extraction failed",
    )
    db.add(job_lead)
    await db.commit()
    await db.refresh(job_lead)
    return job_lead


# ============================================================================
# Job Leads API Tests
# ============================================================================


class TestJobLeadsList:
    """Tests for GET /api/job-leads endpoint."""

    async def test_list_job_leads_unauthenticated(self, client: AsyncClient):
        """Test that listing job leads requires authentication."""
        response = await client.get("/api/job-leads")
        assert response.status_code == 401

    async def test_list_job_leads_authenticated(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_job_lead: JobLead,
    ):
        """Test listing job leads with valid authentication."""
        response = await client.get("/api/job-leads", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "per_page" in data
        assert data["total"] >= 1

    async def test_list_job_leads_pagination(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_user: User,
    ):
        """Test pagination parameters for job leads list."""
        # Create multiple job leads
        for i in range(5):
            lead = JobLead(
                user_id=test_user.id,
                url=f"https://example.com/job/pagination-{i}",
                status="extracted",
            )
            db.add(lead)
        await db.commit()

        # Test pagination
        response = await client.get(
            "/api/job-leads?page=1&per_page=3",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["page"] == 1
        assert data["per_page"] == 3
        assert len(data["items"]) <= 3

    async def test_list_job_leads_status_filter(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db: AsyncSession,
        test_user: User,
    ):
        """Test filtering job leads by status."""
        # Create leads with different statuses
        lead1 = JobLead(
            user_id=test_user.id,
            url="https://example.com/job/filter-extracted",
            status="extracted",
        )
        lead2 = JobLead(
            user_id=test_user.id,
            url="https://example.com/job/filter-failed",
            status="failed",
        )
        db.add_all([lead1, lead2])
        await db.commit()

        # Filter by extracted status
        response = await client.get(
            "/api/job-leads?status=extracted",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        for item in data["items"]:
            assert item["status"] == "extracted"


class TestJobLeadsGet:
    """Tests for GET /api/job-leads/{id} endpoint."""

    async def test_get_job_lead_unauthenticated(self, client: AsyncClient, test_job_lead: JobLead):
        """Test that getting a job lead requires authentication."""
        response = await client.get(f"/api/job-leads/{test_job_lead.id}")
        assert response.status_code == 401

    async def test_get_job_lead_authenticated(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_job_lead: JobLead,
    ):
        """Test getting a job lead with valid authentication."""
        response = await client.get(
            f"/api/job-leads/{test_job_lead.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == test_job_lead.id
        assert data["title"] == "Software Engineer"
        assert data["company"] == "Test Company"

    async def test_get_job_lead_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test getting a non-existent job lead returns 404."""
        response = await client.get(
            "/api/job-leads/non-existent-id",
            headers=auth_headers,
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    async def test_get_job_lead_other_user(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_job_lead: JobLead,
    ):
        """Test that a user cannot access another user's job lead."""
        # Create another user
        other_user = User(
            email="other@example.com",
            password_hash=get_password_hash("pass123"),
            is_admin=False,
            is_active=True,
        )
        db.add(other_user)
        await db.commit()
        await db.refresh(other_user)

        # Create auth headers for other user
        token = create_access_token({"sub": other_user.id})
        headers = {"Authorization": f"Bearer {token}"}

        # Try to access the first user's job lead
        response = await client.get(
            f"/api/job-leads/{test_job_lead.id}",
            headers=headers,
        )
        assert response.status_code == 404


class TestJobLeadsCreate:
    """Tests for POST /api/job-leads endpoint."""

    async def test_create_job_lead_unauthenticated(self, client: AsyncClient):
        """Test that creating a job lead requires authentication."""
        response = await client.post(
            "/api/job-leads",
            json={"url": "https://example.com/job/new"},
        )
        assert response.status_code == 401

    async def test_create_job_lead_with_bearer_token(
        self,
        client: AsyncClient,
        user_with_api_token: User,
    ):
        """Test creating a job lead using Bearer token with API token."""
        # Use the API token as a Bearer token
        headers = {"Authorization": f"Bearer {user_with_api_token.api_token}"}

        # Mock the extraction service with AsyncMock
        with patch("app.api.job_leads.extract_job_data", new_callable=AsyncMock) as mock_extract:
            from app.schemas.job_lead import JobLeadExtractionInput

            mock_extract.return_value = JobLeadExtractionInput(
                title="New Job",
                company="New Company",
                location="Remote",
                requirements_must_have=[],
                requirements_nice_to_have=[],
                skills=[],
            )

            # Provide HTML content to avoid URL fetching
            response = await client.post(
                "/api/job-leads",
                headers=headers,
                json={
                    "url": "https://example.com/job/new-bearer",
                    "html": "<html><body><h1>Job</h1></body></html>",
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "New Job"
        assert data["company"] == "New Company"

    async def test_create_job_lead_with_x_api_key(
        self,
        client: AsyncClient,
        user_with_api_token: User,
    ):
        """Test creating a job lead using X-API-Key header."""
        headers = {"X-API-Key": user_with_api_token.api_token}

        with patch("app.api.job_leads.extract_job_data", new_callable=AsyncMock) as mock_extract:
            from app.schemas.job_lead import JobLeadExtractionInput

            mock_extract.return_value = JobLeadExtractionInput(
                title="API Key Job",
                company="API Company",
                requirements_must_have=[],
                requirements_nice_to_have=[],
                skills=[],
            )

            # Provide HTML content to avoid URL fetching
            response = await client.post(
                "/api/job-leads",
                headers=headers,
                json={
                    "url": "https://example.com/job/new-apikey",
                    "html": "<html><body><h1>Job</h1></body></html>",
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "API Key Job"

    async def test_create_job_lead_duplicate_url(
        self,
        client: AsyncClient,
        user_with_api_token: User,
        db: AsyncSession,
    ):
        """Test that creating a job lead with duplicate URL returns 409."""
        # First create a job lead
        existing_lead = JobLead(
            user_id=user_with_api_token.id,
            url="https://example.com/job/duplicate",
            status="extracted",
        )
        db.add(existing_lead)
        await db.commit()

        headers = {"X-API-Key": user_with_api_token.api_token}

        response = await client.post(
            "/api/job-leads",
            headers=headers,
            json={"url": "https://example.com/job/duplicate"},
        )

        assert response.status_code == 409
        assert "already exists" in response.json()["detail"].lower()

    async def test_create_job_lead_with_html_content(
        self,
        client: AsyncClient,
        user_with_api_token: User,
    ):
        """Test creating a job lead with pre-fetched HTML content."""
        headers = {"X-API-Key": user_with_api_token.api_token}

        with patch("app.api.job_leads.extract_job_data") as mock_extract:
            from app.schemas.job_lead import JobLeadExtractionInput

            mock_extract.return_value = JobLeadExtractionInput(
                title="HTML Job",
                company="HTML Company",
                requirements_must_have=[],
                requirements_nice_to_have=[],
                skills=[],
            )

            response = await client.post(
                "/api/job-leads",
                headers=headers,
                json={
                    "url": "https://example.com/job/with-html",
                    "html": "<html><body><h1>Job Title</h1></body></html>",
                },
            )

        assert response.status_code == 201
        # Verify extract_job_data was called with the HTML content
        mock_extract.assert_called_once()
        call_args = mock_extract.call_args
        assert "Job Title" in call_args[0][0]  # First positional arg is HTML


class TestJobLeadsDelete:
    """Tests for DELETE /api/job-leads/{id} endpoint."""

    async def test_delete_job_lead_unauthenticated(
        self,
        client: AsyncClient,
        test_job_lead: JobLead,
    ):
        """Test that deleting a job lead requires authentication."""
        response = await client.delete(f"/api/job-leads/{test_job_lead.id}")
        assert response.status_code == 401

    async def test_delete_job_lead_authenticated(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_job_lead: JobLead,
        db: AsyncSession,
    ):
        """Test deleting a job lead with valid authentication."""
        response = await client.delete(
            f"/api/job-leads/{test_job_lead.id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

        # Verify the job lead was deleted
        result = await db.execute(
            select(JobLead).where(JobLead.id == test_job_lead.id)
        )
        assert result.scalars().first() is None

    async def test_delete_job_lead_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test deleting a non-existent job lead returns 404."""
        response = await client.delete(
            "/api/job-leads/non-existent-id",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestJobLeadsRetry:
    """Tests for POST /api/job-leads/{id}/retry endpoint."""

    async def test_retry_job_lead_unauthenticated(
        self,
        client: AsyncClient,
        failed_job_lead: JobLead,
    ):
        """Test that retrying a job lead requires authentication."""
        response = await client.post(f"/api/job-leads/{failed_job_lead.id}/retry")
        assert response.status_code == 401

    async def test_retry_job_lead_not_failed(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_job_lead: JobLead,
    ):
        """Test that retrying a non-failed job lead returns 400."""
        response = await client.post(
            f"/api/job-leads/{test_job_lead.id}/retry",
            headers=auth_headers,
        )
        assert response.status_code == 400
        assert "failed" in response.json()["detail"].lower()

    async def test_retry_job_lead_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        failed_job_lead: JobLead,
    ):
        """Test successfully retrying a failed job lead."""
        with patch("app.api.job_leads._fetch_html") as mock_fetch, \
             patch("app.api.job_leads.extract_job_data") as mock_extract:
            from app.schemas.job_lead import JobLeadExtractionInput

            mock_fetch.return_value = "<html><body>Job content</body></html>"
            mock_extract.return_value = JobLeadExtractionInput(
                title="Retried Job",
                company="Retried Company",
                location="Nowhere",
                requirements_must_have=["Python"],
                requirements_nice_to_have=[],
                skills=["Python"],
            )

            response = await client.post(
                f"/api/job-leads/{failed_job_lead.id}/retry",
                headers=auth_headers,
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "extracted"
        assert data["title"] == "Retried Job"
        assert data["error_message"] is None


# ============================================================================
# User Profile API Tests
# ============================================================================


class TestProfileGet:
    """Tests for GET /api/profile endpoint."""

    async def test_get_profile_unauthenticated(self, client: AsyncClient):
        """Test that getting profile requires authentication."""
        response = await client.get("/api/profile")
        assert response.status_code == 401

    async def test_get_profile_creates_if_not_exists(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test that getting profile creates one if it doesn't exist."""
        # Verify no profile exists
        result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == test_user.id)
        )
        assert result.scalars().first() is None

        response = await client.get("/api/profile", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        assert data["user_id"] == test_user.id
        # New profile should have null fields
        assert data["first_name"] is None
        assert data["last_name"] is None

    async def test_get_profile_returns_existing(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test that getting profile returns existing profile data."""
        # Create a profile
        profile = UserProfile(
            user_id=test_user.id,
            first_name="John",
            last_name="Doe",
            email="john@example.com",
            location="San Francisco, CA",
        )
        db.add(profile)
        await db.commit()

        response = await client.get("/api/profile", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        assert data["first_name"] == "John"
        assert data["last_name"] == "Doe"
        assert data["email"] == "john@example.com"
        assert data["location"] == "San Francisco, CA"


class TestProfileUpdate:
    """Tests for PUT /api/profile endpoint."""

    async def test_update_profile_unauthenticated(self, client: AsyncClient):
        """Test that updating profile requires authentication."""
        response = await client.put(
            "/api/profile",
            json={"first_name": "Jane"},
        )
        assert response.status_code == 401

    async def test_update_profile_creates_if_not_exists(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test that updating profile creates one if it doesn't exist."""
        response = await client.put(
            "/api/profile",
            headers=auth_headers,
            json={
                "first_name": "Jane",
                "last_name": "Smith",
                "location": "New York, NY",
            },
        )
        assert response.status_code == 200

        data = response.json()
        assert data["first_name"] == "Jane"
        assert data["last_name"] == "Smith"
        assert data["location"] == "New York, NY"

    async def test_update_profile_partial_update(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test partial update of profile fields."""
        # Create a profile with initial data
        profile = UserProfile(
            user_id=test_user.id,
            first_name="John",
            last_name="Doe",
            location="San Francisco, CA",
        )
        db.add(profile)
        await db.commit()

        # Update only first_name
        response = await client.put(
            "/api/profile",
            headers=auth_headers,
            json={"first_name": "Jane"},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["first_name"] == "Jane"  # Updated
        assert data["last_name"] == "Doe"  # Unchanged
        assert data["location"] == "San Francisco, CA"  # Unchanged

    async def test_update_profile_work_authorization(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test updating work authorization fields."""
        response = await client.put(
            "/api/profile",
            headers=auth_headers,
            json={
                "authorized_to_work": "US Citizen",
                "requires_sponsorship": False,
            },
        )
        assert response.status_code == 200

        data = response.json()
        assert data["authorized_to_work"] == "US Citizen"
        assert data["requires_sponsorship"] is False

    async def test_update_profile_skills(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test updating skills array."""
        response = await client.put(
            "/api/profile",
            headers=auth_headers,
            json={
                "skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
            },
        )
        assert response.status_code == 200

        data = response.json()
        assert data["skills"] == ["Python", "FastAPI", "PostgreSQL", "Docker"]

    async def test_update_profile_invalid_linkedin_url(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that invalid LinkedIn URL is rejected."""
        response = await client.put(
            "/api/profile",
            headers=auth_headers,
            json={"linkedin_url": "not-a-valid-url"},
        )
        assert response.status_code == 422

    async def test_update_profile_valid_linkedin_url(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that valid LinkedIn URL is accepted."""
        response = await client.put(
            "/api/profile",
            headers=auth_headers,
            json={"linkedin_url": "https://linkedin.com/in/johndoe"},
        )
        assert response.status_code == 200
        assert response.json()["linkedin_url"] == "https://linkedin.com/in/johndoe"


# ============================================================================
# Settings API Tests
# ============================================================================


class TestSettingsAPIKey:
    """Tests for GET /api/settings/api-key endpoint."""

    async def test_get_api_key_unauthenticated(self, client: AsyncClient):
        """Test that getting API key requires authentication."""
        response = await client.get("/api/settings/api-key")
        assert response.status_code == 401

    async def test_get_api_key_no_key(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test getting API key when user has none."""
        response = await client.get("/api/settings/api-key", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        assert data["has_api_key"] is False
        assert data["api_key_masked"] is None

    async def test_get_api_key_with_key(
        self,
        client: AsyncClient,
        user_with_api_token: User,
    ):
        """Test getting API key when user has one."""
        token = create_access_token({"sub": user_with_api_token.id})
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.get("/api/settings/api-key", headers=headers)
        assert response.status_code == 200

        data = response.json()
        assert data["has_api_key"] is True
        assert data["api_key_masked"] is not None
        # Masked format: "abcd...wxyz" or similar
        assert "..." in data["api_key_masked"]


class TestSettingsAPIKeyRegenerate:
    """Tests for POST /api/settings/api-key/regenerate endpoint."""

    async def test_regenerate_api_key_unauthenticated(self, client: AsyncClient):
        """Test that regenerating API key requires authentication."""
        response = await client.post("/api/settings/api-key/regenerate")
        assert response.status_code == 401

    async def test_regenerate_api_key_creates_new(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test that regenerating API key creates a new one."""
        response = await client.post(
            "/api/settings/api-key/regenerate",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["has_api_key"] is True
        assert data["api_key_masked"] is not None

        # Verify the token was saved to the database
        await db.refresh(test_user)
        assert test_user.api_token is not None

    async def test_regenerate_api_key_replaces_existing(
        self,
        client: AsyncClient,
        user_with_api_token: User,
        db: AsyncSession,
    ):
        """Test that regenerating replaces an existing API key."""
        old_token = user_with_api_token.api_token
        token = create_access_token({"sub": user_with_api_token.id})
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.post(
            "/api/settings/api-key/regenerate",
            headers=headers,
        )
        assert response.status_code == 200

        # Verify the token was changed
        await db.refresh(user_with_api_token)
        assert user_with_api_token.api_token != old_token


# ============================================================================
# Admin AI Settings API Tests
# ============================================================================


class TestAdminAISettingsGet:
    """Tests for GET /api/admin/ai-settings endpoint."""

    async def test_get_ai_settings_unauthenticated(self, client: AsyncClient):
        """Test that getting AI settings requires authentication."""
        response = await client.get("/api/admin/ai-settings")
        assert response.status_code == 401

    async def test_get_ai_settings_non_admin(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that getting AI settings requires admin privileges."""
        response = await client.get("/api/admin/ai-settings", headers=auth_headers)
        assert response.status_code == 403
        assert "admin" in response.json()["detail"].lower()

    async def test_get_ai_settings_admin(
        self,
        client: AsyncClient,
        admin_auth_headers: dict,
    ):
        """Test getting AI settings as admin."""
        response = await client.get(
            "/api/admin/ai-settings",
            headers=admin_auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert "litellm_model" in data
        assert "litellm_api_key_masked" in data
        assert "litellm_base_url" in data
        assert "is_configured" in data

    async def test_get_ai_settings_shows_masked_key(
        self,
        client: AsyncClient,
        admin_auth_headers: dict,
        db: AsyncSession,
    ):
        """Test that API key is masked in response."""
        # Set an API key
        from app.core.security import encrypt_api_key

        test_api_key = "sk-test-secret-key-1234"
        setting = SystemSettings(
            key=SystemSettings.KEY_LITELLM_API_KEY,
            value=encrypt_api_key(test_api_key),
        )
        db.add(setting)
        setting2 = SystemSettings(
            key=SystemSettings.KEY_LITELLM_MODEL,
            value="gpt-4o",
        )
        db.add(setting2)
        await db.commit()

        response = await client.get(
            "/api/admin/ai-settings",
            headers=admin_auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        # Key should be masked, showing only last 4 chars
        assert data["litellm_api_key_masked"] is not None
        assert data["litellm_api_key_masked"].endswith("1234")
        # The full key should NOT be visible
        assert test_api_key not in data["litellm_api_key_masked"]
        # Check the masking format (...last4)
        assert "..." in data["litellm_api_key_masked"]


class TestAdminAISettingsUpdate:
    """Tests for PUT /api/admin/ai-settings endpoint."""

    async def test_update_ai_settings_unauthenticated(self, client: AsyncClient):
        """Test that updating AI settings requires authentication."""
        response = await client.put(
            "/api/admin/ai-settings",
            json={"litellm_model": "gpt-4o"},
        )
        assert response.status_code == 401

    async def test_update_ai_settings_non_admin(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that updating AI settings requires admin privileges."""
        response = await client.put(
            "/api/admin/ai-settings",
            headers=auth_headers,
            json={"litellm_model": "gpt-4o"},
        )
        assert response.status_code == 403

    async def test_update_ai_settings_admin(
        self,
        client: AsyncClient,
        admin_auth_headers: dict,
    ):
        """Test updating AI settings as admin."""
        response = await client.put(
            "/api/admin/ai-settings",
            headers=admin_auth_headers,
            json={
                "litellm_model": "gpt-4o",
                "litellm_api_key": "sk-test-api-key",
                "litellm_base_url": "https://api.openai.com/v1",
            },
        )
        assert response.status_code == 200

        data = response.json()
        assert data["litellm_model"] == "gpt-4o"
        assert data["litellm_base_url"] == "https://api.openai.com/v1"
        # API key should be masked in response
        assert data["litellm_api_key_masked"] is not None
        assert "sk-test-api-key" not in data["litellm_api_key_masked"]
        assert data["is_configured"] is True

    async def test_update_ai_settings_partial(
        self,
        client: AsyncClient,
        admin_auth_headers: dict,
    ):
        """Test partial update of AI settings."""
        response = await client.put(
            "/api/admin/ai-settings",
            headers=admin_auth_headers,
            json={"litellm_model": "claude-3-sonnet"},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["litellm_model"] == "claude-3-sonnet"

    async def test_update_ai_settings_empty_model_validation(
        self,
        client: AsyncClient,
        admin_auth_headers: dict,
    ):
        """Test that empty model name is rejected."""
        response = await client.put(
            "/api/admin/ai-settings",
            headers=admin_auth_headers,
            json={"litellm_model": "   "},  # Whitespace only
        )
        assert response.status_code == 422  # Validation error


# ============================================================================
# Authentication Method Tests
# ============================================================================


class TestAuthenticationMethods:
    """Tests for different authentication methods."""

    async def test_bearer_token_jwt_auth(
        self,
        client: AsyncClient,
        test_user: User,
    ):
        """Test authentication with JWT Bearer token."""
        token = create_access_token({"sub": test_user.id})
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.get("/api/profile", headers=headers)
        assert response.status_code == 200

    async def test_bearer_token_api_token_auth(
        self,
        client: AsyncClient,
        user_with_api_token: User,
    ):
        """Test authentication with API token as Bearer token."""
        headers = {"Authorization": f"Bearer {user_with_api_token.api_token}"}

        # API token auth works for job_leads create endpoint
        with patch("app.api.job_leads.extract_job_data", new_callable=AsyncMock) as mock_extract:
            from app.schemas.job_lead import JobLeadExtractionInput

            mock_extract.return_value = JobLeadExtractionInput(
                title="Test",
                company="Test",
                requirements_must_have=[],
                requirements_nice_to_have=[],
                skills=[],
            )

            # Provide HTML content to avoid URL fetching
            response = await client.post(
                "/api/job-leads",
                headers=headers,
                json={
                    "url": "https://example.com/job/auth-test",
                    "html": "<html><body><h1>Job</h1></body></html>",
                },
            )

        assert response.status_code == 201

    async def test_x_api_key_header_auth(
        self,
        client: AsyncClient,
        user_with_api_token: User,
    ):
        """Test authentication with X-API-Key header."""
        headers = {"X-API-Key": user_with_api_token.api_token}

        # X-API-Key works for job_leads create endpoint
        with patch("app.api.job_leads.extract_job_data", new_callable=AsyncMock) as mock_extract:
            from app.schemas.job_lead import JobLeadExtractionInput

            mock_extract.return_value = JobLeadExtractionInput(
                title="Test",
                company="Test",
                requirements_must_have=[],
                requirements_nice_to_have=[],
                skills=[],
            )

            # Provide HTML content to avoid URL fetching
            response = await client.post(
                "/api/job-leads",
                headers=headers,
                json={
                    "url": "https://example.com/job/x-api-key-test",
                    "html": "<html><body><h1>Job</h1></body></html>",
                },
            )

        assert response.status_code == 201

    async def test_invalid_token_returns_401(self, client: AsyncClient):
        """Test that invalid tokens return 401."""
        headers = {"Authorization": "Bearer invalid-token-12345"}

        response = await client.get("/api/profile", headers=headers)
        assert response.status_code == 401

    async def test_invalid_api_token_returns_401(self, client: AsyncClient):
        """Test that invalid API tokens return 401."""
        headers = {"X-API-Key": "invalid-api-key-12345"}

        response = await client.post(
            "/api/job-leads",
            headers=headers,
            json={"url": "https://example.com/job/invalid-key"},
        )
        assert response.status_code == 401

    async def test_disabled_user_returns_403(
        self,
        client: AsyncClient,
        db: AsyncSession,
    ):
        """Test that disabled users get 403 Forbidden."""
        # Create a disabled user
        disabled_user = User(
            email="disabled@example.com",
            password_hash=get_password_hash("pass123"),
            is_admin=False,
            is_active=False,
        )
        db.add(disabled_user)
        await db.commit()
        await db.refresh(disabled_user)

        token = create_access_token({"sub": disabled_user.id})
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.get("/api/profile", headers=headers)
        assert response.status_code == 403
        assert "disabled" in response.json()["detail"].lower()


# ============================================================================
# Health Check Test
# ============================================================================


class TestHealthCheck:
    """Tests for the health check endpoint."""

    async def test_health_check(self, client: AsyncClient):
        """Test that health check returns healthy status."""
        response = await client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "healthy"
