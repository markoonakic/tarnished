"""Tests for import validation functionality.

These tests verify that the import validation endpoint works correctly,
including ZIP file safety validation and data validation.
"""

import io
import json
import zipfile
from datetime import date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    MediaType,
    Round,
    RoundMedia,
    RoundType,
    User,
)


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    """Create a test user with admin privileges."""
    user = User(
        email="test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=True,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def test_statuses(db: AsyncSession, test_user: User) -> list[ApplicationStatus]:
    """Create test application statuses."""
    statuses = [
        ApplicationStatus(name="Wishlist", color="#83a598", is_default=True, user_id=test_user.id),
        ApplicationStatus(name="Applied", color="#8ec07c", is_default=True, user_id=test_user.id),
        ApplicationStatus(name="Interview", color="#fe8019", is_default=True, user_id=test_user.id),
    ]
    for status in statuses:
        db.add(status)
    await db.commit()
    for status in statuses:
        await db.refresh(status)
    return statuses


@pytest.fixture
async def test_round_types(db: AsyncSession, test_user: User) -> list[RoundType]:
    """Create test round types."""
    round_types = [
        RoundType(name="Phone Screen", is_default=True, user_id=test_user.id),
        RoundType(name="Technical Interview", is_default=True, user_id=test_user.id),
    ]
    for round_type in round_types:
        db.add(round_type)
    await db.commit()
    for round_type in round_types:
        await db.refresh(round_type)
    return round_types


@pytest.fixture
async def test_applications(
    db: AsyncSession,
    test_user: User,
    test_statuses: list[ApplicationStatus],
) -> list[Application]:
    """Create test applications."""
    applications = []

    app1 = Application(
        user_id=test_user.id,
        company="Tech Corp",
        job_title="Software Engineer",
        status_id=test_statuses[0].id,
        applied_at=date(2024, 1, 15),
    )
    db.add(app1)
    applications.append(app1)

    app2 = Application(
        user_id=test_user.id,
        company="Startup Inc",
        job_title="Full Stack Developer",
        status_id=test_statuses[1].id,
        applied_at=date(2024, 1, 20),
    )
    db.add(app2)

    await db.commit()
    for app in applications:
        await db.refresh(app)
    return applications


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    """Create authentication headers for test user."""
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_import_data(test_user: User) -> dict:
    """Create sample import data."""
    return {
        "user": {
            "id": str(test_user.id),
            "email": test_user.email,
        },
        "custom_statuses": [
            {
                "name": "Custom Status",
                "color": "#ff0000",
                "is_default": False,
                "order": 100,
            }
        ],
        "custom_round_types": [
            {
                "name": "Custom Round",
                "is_default": False,
            }
        ],
        "applications": [
            {
                "id": "old-id-1",
                "company": "New Company",
                "job_title": "New Job",
                "job_description": "New Description",
                "job_url": "https://example.com/job",
                "status": "Applied",
                "cv_path": "/cvs/new_cv.pdf",
                "applied_at": "2024-01-25",
                "status_history": [
                    {
                        "from_status": None,
                        "to_status": "Applied",
                        "changed_at": "2024-01-25T10:00:00",
                        "note": "Applied online",
                    }
                ],
                "rounds": [
                    {
                        "id": "old-round-id-1",
                        "type": "Phone Screen",
                        "scheduled_at": "2024-01-26T10:00:00",
                        "completed_at": None,
                        "outcome": None,
                        "notes_summary": "Scheduled",
                        "media": [],
                    }
                ],
            }
        ],
    }


@pytest.fixture
def sample_import_zip(sample_import_data: dict) -> bytes:
    """Create a sample import ZIP file."""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr('data.json', json.dumps(sample_import_data))
    zip_buffer.seek(0)
    return zip_buffer.read()


class TestImportValidationAuthentication:
    """Test import validation authentication and authorization."""

    async def test_validate_requires_authentication(
        self,
        client: AsyncClient,
        sample_import_zip: bytes,
    ):
        """Test that validation endpoint requires authentication."""
        files = {"file": ("import.zip", sample_import_zip, "application/zip")}
        response = await client.post("/api/import/validate", files=files)
        assert response.status_code == 401

    async def test_validate_with_valid_token(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        sample_import_zip: bytes,
    ):
        """Test that validation works with valid authentication."""
        files = {"file": ("import.zip", sample_import_zip, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        # Should get 200 or 422 (validation error), but not 401
        assert response.status_code != 401


class TestImportValidationBasic:
    """Test basic import validation functionality."""

    async def test_validate_accepts_valid_zip(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        sample_import_zip: bytes,
    ):
        """Test validation accepts a valid ZIP file."""
        files = {"file": ("import.zip", sample_import_zip, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["valid"] is True
        assert "summary" in data
        assert data["summary"]["applications"] == 1
        assert data["summary"]["rounds"] == 1
        assert data["summary"]["status_history"] == 1
        assert data["summary"]["custom_statuses"] == 1
        assert data["summary"]["custom_round_types"] == 1

    async def test_validate_rejects_missing_data_json(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test validation rejects ZIP without data.json."""
        # Create ZIP without data.json
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('other.txt', 'some content')
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        files = {"file": ("import.zip", zip_bytes, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 400

    async def test_validate_rejects_invalid_json(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test validation rejects ZIP with invalid JSON."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('data.json', 'invalid json{{')
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        files = {"file": ("import.zip", zip_bytes, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert len(data["errors"]) > 0

    async def test_validate_rejects_invalid_data_schema(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test validation rejects ZIP with invalid schema."""
        invalid_data = {"invalid": "data"}
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('data.json', json.dumps(invalid_data))
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        files = {"file": ("import.zip", zip_bytes, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert len(data["errors"]) > 0


class TestImportValidationWarnings:
    """Test import validation warnings."""

    async def test_warns_about_existing_applications(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
        sample_import_zip: bytes,
    ):
        """Test validation warns about existing applications."""
        files = {"file": ("import.zip", sample_import_zip, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["valid"] is True
        warnings = data.get("warnings", [])
        assert any("existing applications" in w.lower() for w in warnings)

    async def test_warns_about_missing_statuses(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Test validation warns about missing statuses."""
        # Create import with status that doesn't exist
        import_data = {
            "user": {"id": str(test_user.id), "email": test_user.email},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [
                {
                    "company": "Test Company",
                    "job_title": "Test Job",
                    "status": "NonExistentStatus",
                    "applied_at": "2024-01-25",
                    "status_history": [],
                    "rounds": [],
                }
            ],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('data.json', json.dumps(import_data))
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        files = {"file": ("import.zip", zip_bytes, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["valid"] is True
        warnings = data.get("warnings", [])
        # Should warn about creating new status
        assert any("new statuses" in w.lower() or "nonexistentstatus" in w.lower() for w in warnings)


class TestZIPSafetyValidation:
    """Test ZIP file safety validation."""

    async def test_rejects_zip_with_path_traversal(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Test validation rejects ZIP with path traversal attempts."""
        import_data = {
            "user": {"id": str(test_user.id), "email": test_user.email},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('data.json', json.dumps(import_data))
            # Add path traversal file
            zipf.writestr('../../../etc/passwd', 'malicious')
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        files = {"file": ("import.zip", zip_bytes, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert any("path traversal" in e.lower() for e in data.get("errors", []))

    async def test_rejects_zip_with_absolute_path(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Test validation rejects ZIP with absolute paths."""
        import_data = {
            "user": {"id": str(test_user.id), "email": test_user.email},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('data.json', json.dumps(import_data))
            # Add absolute path
            zipf.writestr('/tmp/malicious.txt', 'malicious')
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        files = {"file": ("import.zip", zip_bytes, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert any("absolute path" in e.lower() for e in data.get("errors", []))

    async def test_rejects_oversized_zip(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Test validation rejects oversized ZIP files."""
        # Create ZIP with many files (more than limit)
        import_data = {
            "user": {"id": str(test_user.id), "email": test_user.email},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('data.json', json.dumps(import_data))
            # Add many files to exceed limit
            for i in range(1001):  # Exceeds MAX_FILE_COUNT of 1000
                zipf.writestr(f'file{i}.txt', f'content {i}')
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        files = {"file": ("import.zip", zip_bytes, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert any("too many files" in e.lower() for e in data.get("errors", []))

    async def test_rejects_non_zip_file(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test validation rejects non-ZIP files."""
        files = {"file": ("import.zip", b"not a zip file", "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert len(data["errors"]) > 0


class TestImportValidationSummary:
    """Test import validation summary generation."""

    async def test_summary_includes_file_count(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        sample_import_data: dict,
        test_user: User,
    ):
        """Test summary includes file count."""
        # Add media files to import
        sample_import_data["applications"][0]["rounds"][0]["media"] = [
            {"type": "video", "path": "/media/interview.mp4"},
            {"type": "audio", "path": "/media/audio.mp3"},
        ]

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('data.json', json.dumps(sample_import_data))
            zipf.writestr('files/media/interview.mp4', b'fake video content')
            zipf.writestr('files/media/audio.mp3', b'fake audio content')
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        files = {"file": ("import.zip", zip_bytes, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["valid"] is True
        # files count should be 2 (data.json doesn't count)
        assert data["summary"]["files"] == 2

    async def test_summary_includes_counts(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        sample_import_zip: bytes,
    ):
        """Test summary includes all relevant counts."""
        files = {"file": ("import.zip", sample_import_zip, "application/zip")}
        response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()
        assert data["valid"] is True
        summary = data["summary"]

        assert "applications" in summary
        assert "rounds" in summary
        assert "status_history" in summary
        assert "custom_statuses" in summary
        assert "custom_round_types" in summary
        assert "files" in summary


class TestValidateZIPSafety:
    """Test validate_zip_safety function directly."""

    async def test_validate_safe_zip(self):
        """Test validate_zip_safety with safe ZIP."""
        from app.api.utils.zip_utils import validate_zip_safety

        # Create safe ZIP
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as f:
            zip_path = f.name

        try:
            with zipfile.ZipFile(zip_path, 'w') as zf:
                zf.writestr('data.json', '{"test": "data"}')
                zf.writestr('files/test.txt', 'content')

            result = await validate_zip_safety(zip_path)
            assert result["is_safe"] is True
            assert result["file_count"] == 2
        finally:
            import os
            if os.path.exists(zip_path):
                os.remove(zip_path)

    async def test_validate_zip_bomb_rejected(self):
        """Test validate_zip_safety rejects ZIP bombs."""
        from app.api.utils.zip_utils import validate_zip_safety

        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as f:
            zip_path = f.name

        try:
            # Create a file that will have high compression ratio
            # (many repeated bytes compress very well)
            large_content = b'A' * (10 * 1024 * 1024)  # 10MB of A's

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('data.json', '{"test": "data"}')
                # This should create a high compression ratio
                zf.writestr('large.txt', large_content)

            # Should reject ZIP bombs with ValueError
            with pytest.raises(ValueError, match="compression ratio"):
                await validate_zip_safety(zip_path)
        finally:
            import os
            if os.path.exists(zip_path):
                os.remove(zip_path)
