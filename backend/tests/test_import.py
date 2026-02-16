"""Tests for import validation functionality.

These tests verify that the import validation endpoint works correctly,
including ZIP file safety validation and data validation.
"""

import asyncio
import io
import json
import os
import tempfile
import zipfile
from datetime import date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
async def import_user(db: AsyncSession) -> dict:
    """Create an import user with headers for import tests."""
    user = User(
        email="import@example.com",
        password_hash=get_password_hash("importpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": user.id})
    return {
        "Authorization": f"Bearer {token}",
        "user_id": user.id,
    }


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


@pytest.fixture
def sample_import_zip_file(sample_import_zip: bytes) -> str:
    """Create a sample import ZIP file and return its path."""
    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as f:
        f.write(sample_import_zip)
        return f.name


@pytest.fixture
def sample_import_with_phone_screen(import_user: dict) -> dict:
    """Create sample import data with Phone Screen status for testing."""
    return {
        "user": {
            "id": str(import_user["user_id"]),
            "email": "import@example.com",
        },
        "custom_statuses": [],
        "custom_round_types": [],
        "applications": [
            {
                "id": "app-old-1",
                "company": "TestCorp",
                "job_title": "Developer",
                "job_description": "Test description",
                "job_url": None,
                "status": "Phone Screen",
                "cv_path": None,
                "applied_at": "2024-01-25",
                "status_history": [
                    {
                        "from_status": None,
                        "to_status": "Phone Screen",
                        "changed_at": "2024-01-25T10:00:00",
                        "note": "Applied",
                    }
                ],
                "rounds": [
                    {
                        "id": "round-old-1",
                        "type": "Technical Interview",
                        "scheduled_at": "2024-01-26T10:00:00",
                        "completed_at": None,
                        "outcome": "Passed",
                        "notes_summary": "Good interview",
                        "media": [],
                    }
                ],
            }
        ],
    }


@pytest.fixture
def sample_import_zip_with_phone_screen(sample_import_with_phone_screen: dict) -> str:
    """Create a sample import ZIP file and return its path."""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr('data.json', json.dumps(sample_import_with_phone_screen))
    zip_buffer.seek(0)
    zip_bytes = zip_buffer.read()

    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as f:
        f.write(zip_bytes)
        return f.name


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


class TestImportData:
    """Test the actual import functionality."""

    async def test_import_creates_missing_status(
        self, client: AsyncClient, import_user: dict, sample_import_zip_with_phone_screen: str, db: AsyncSession
    ):
        """Test import creates missing status automatically."""
        # Check status doesn't exist
        result = await db.execute(
            select(ApplicationStatus)
            .where(ApplicationStatus.name == "Phone Screen")
        )
        assert result.scalar_one_or_none() is None

        # Import
        with open(sample_import_zip_with_phone_screen, 'rb') as f:
            response = await client.post(
                "/api/import/import",
                files={"file": ("import.zip", f, "application/zip")},
                headers=import_user,
                data={"override": "false"}
            )

        assert response.status_code == 200

        # Wait for import to complete
        await asyncio.sleep(2)

        # Check status was created
        result = await db.execute(
            select(ApplicationStatus)
            .where(ApplicationStatus.name == "Phone Screen")
        )
        status = result.scalar_one_or_none()
        assert status is not None
        assert status.color == "#6B7280"  # Default gray

        # Clean up temp file
        import os
        if os.path.exists(sample_import_zip_with_phone_screen):
            os.remove(sample_import_zip_with_phone_screen)

    async def test_import_creates_application(
        self, client: AsyncClient, import_user: dict, sample_import_zip_with_phone_screen: str, db: AsyncSession
    ):
        """Test import creates application with new ID."""
        user_id = import_user["user_id"]

        with open(sample_import_zip_with_phone_screen, 'rb') as f:
            response = await client.post(
                "/api/import/import",
                files={"file": ("import.zip", f, "application/zip")},
                headers=import_user,
                data={"override": "false"}
            )

        assert response.status_code == 200
        import_id = response.json()["import_id"]

        # Wait for import to complete
        await asyncio.sleep(2)

        # Check application was created
        result = await db.execute(
            select(Application)
            .where(Application.user_id == user_id)
            .where(Application.company == "TestCorp")
        )
        app = result.scalar_one_or_none()
        assert app is not None
        assert app.job_title == "Developer"
        assert app.id != "app-old-1"  # New ID generated

        # Clean up temp file
        import os
        if os.path.exists(sample_import_zip_with_phone_screen):
            os.remove(sample_import_zip_with_phone_screen)

    async def test_import_creates_rounds_with_relationships(
        self, client: AsyncClient, import_user: dict, sample_import_zip_with_phone_screen: str, db: AsyncSession
    ):
        """Test import creates rounds with correct relationships."""
        from sqlalchemy.orm import selectinload
        user_id = import_user["user_id"]

        with open(sample_import_zip_with_phone_screen, 'rb') as f:
            response = await client.post(
                "/api/import/import",
                files={"file": ("import.zip", f, "application/zip")},
                headers=import_user,
                data={"override": "false"}
            )

        # Wait for import to complete
        await asyncio.sleep(2)

        # Check application has round
        result = await db.execute(
            select(Application)
            .options(selectinload(Application.rounds))
            .where(Application.user_id == user_id)
            .where(Application.company == "TestCorp")
        )
        app = result.scalar_one()

        assert len(app.rounds) == 1
        round = app.rounds[0]
        assert round.outcome == "Passed"
        assert round.notes_summary == "Good interview"

        # Clean up temp file
        import os
        if os.path.exists(sample_import_zip_with_phone_screen):
            os.remove(sample_import_zip_with_phone_screen)


class TestImportOverride:
    """Test the override functionality."""

    async def test_override_deletes_existing_data(
        self, client: AsyncClient, import_user: dict, db: AsyncSession, sample_import_zip_with_phone_screen: str
    ):
        """Test override option deletes existing applications."""
        user_id = import_user["user_id"]

        # Create an existing application
        status = ApplicationStatus(name="Old Status", color="#000000", is_default=True, user_id=user_id)
        db.add(status)
        await db.flush()

        existing_app = Application(
            user_id=user_id,
            company="Existing Company",
            job_title="Old Job",
            status_id=status.id,
            applied_at=date.today()
        )
        db.add(existing_app)
        await db.commit()

        # Count applications before import
        result = await db.execute(
            select(Application)
            .where(Application.user_id == user_id)
        )
        count_before = len(result.scalars().all())
        assert count_before == 1

        # Import with override
        with open(sample_import_zip_with_phone_screen, 'rb') as f:
            response = await client.post(
                "/api/import/import",
                files={"file": ("import.zip", f, "application/zip")},
                headers=import_user,
                data={"override": "true"}
            )

        assert response.status_code == 200

        # Wait for import to complete
        await asyncio.sleep(2)

        # Check old application is gone
        result = await db.execute(
            select(Application)
            .where(Application.user_id == user_id)
        )
        apps = result.scalars().all()
        assert len(apps) == 1
        assert apps[0].company == "TestCorp"  # New data

        # Clean up temp file
        if os.path.exists(sample_import_zip_with_phone_screen):
            os.remove(sample_import_zip_with_phone_screen)


class TestEndToEnd:
    """Test complete export to import workflow."""

    async def test_export_then_import_round_trip(
        self, client: AsyncClient, auth_headers: dict[str, str], db: AsyncSession, test_user: User
    ):
        """Test that data can be exported and then imported successfully."""
        user_id = test_user.id

        # First, create some test data
        status = ApplicationStatus(name="Test Status", color="#FF0000", is_default=False, order=1, user_id=user_id)
        db.add(status)
        await db.flush()

        app = Application(
            user_id=user_id,
            company="ExportTest Company",
            job_title="Test Job",
            status_id=status.id,
            applied_at=date.today(),
        )
        db.add(app)
        await db.commit()
        await db.refresh(app)

        # Export the data
        response = await client.get("/api/export/zip", headers=auth_headers)
        assert response.status_code == 200

        zip_bytes = await response.aread()

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp.write(zip_bytes)
            temp_zip_path = tmp.name

        try:
            # Now import it back
            with open(temp_zip_path, "rb") as f:
                import_data = {"file": ("test_export.zip", f, "application/zip")}

                response = await client.post(
                    "/api/import/import",
                    files=import_data,
                    headers=auth_headers,
                    data={"override": "true"},
                )

            assert response.status_code == 200
            import_id = response.json()["import_id"]

            # Wait for import to complete
            await asyncio.sleep(3)

            # Verify the data was imported correctly
            result = await db.execute(
                select(Application)
                .where(Application.user_id == user_id)
                .where(Application.company == "ExportTest Company")
            )
            imported_app = result.scalar_one_or_none()

            assert imported_app is not None
            assert imported_app.job_title == "Test Job"

        finally:
            os.unlink(temp_zip_path)

    async def test_export_import_preserves_status_history(
        self, client: AsyncClient, auth_headers: dict[str, str], db: AsyncSession, test_user: User, test_statuses: list[ApplicationStatus]
    ):
        """Test that status history is preserved through export/import cycle."""
        user_id = test_user.id

        # Create application with status history
        app = Application(
            user_id=user_id,
            company="HistoryTest Company",
            job_title="Test Job",
            status_id=test_statuses[2].id,
            applied_at=date(2024, 1, 10),
        )
        db.add(app)
        await db.flush()

        # Add status history
        history1 = ApplicationStatusHistory(
            application_id=app.id,
            from_status_id=None,
            to_status_id=test_statuses[0].id,
            changed_at=datetime(2024, 1, 8, 9, 0),
            note="Added to wishlist",
        )
        db.add(history1)

        history2 = ApplicationStatusHistory(
            application_id=app.id,
            from_status_id=test_statuses[0].id,
            to_status_id=test_statuses[1].id,
            changed_at=datetime(2024, 1, 10, 10, 30),
            note="Applied through portal",
        )
        db.add(history2)

        await db.commit()

        # Export
        response = await client.get("/api/export/zip", headers=auth_headers)
        assert response.status_code == 200

        zip_bytes = await response.aread()

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp.write(zip_bytes)
            temp_zip_path = tmp.name

        try:
            # Delete original data to test fresh import
            await db.execute(
                select(ApplicationStatusHistory).where(ApplicationStatusHistory.application_id == app.id)
            )
            await db.delete(app)
            await db.commit()

            # Import
            with open(temp_zip_path, "rb") as f:
                import_data = {"file": ("test_export.zip", f, "application/zip")}

                response = await client.post(
                    "/api/import/import",
                    files=import_data,
                    headers=auth_headers,
                    data={"override": "false"},
                )

            assert response.status_code == 200

            # Wait for import to complete
            await asyncio.sleep(3)

            # Verify status history was imported
            result = await db.execute(
                select(Application)
                .options(selectinload(Application.status_history))
                .where(Application.user_id == user_id)
                .where(Application.company == "HistoryTest Company")
            )
            imported_app = result.scalar_one_or_none()

            assert imported_app is not None
            assert len(imported_app.status_history) == 2

        finally:
            os.unlink(temp_zip_path)

    async def test_export_import_preserves_rounds_and_media(
        self, client: AsyncClient, auth_headers: dict[str, str], db: AsyncSession, test_user: User, test_round_types: list[RoundType]
    ):
        """Test that rounds are preserved through export/import cycle (media files not included if they don't exist)."""
        user_id = test_user.id

        # Create application with rounds
        status = ApplicationStatus(name="Round Test Status", color="#00FF00", is_default=False, order=1, user_id=user_id)
        db.add(status)
        await db.flush()

        app = Application(
            user_id=user_id,
            company="RoundTest Company",
            job_title="Test Job",
            status_id=status.id,
            applied_at=date(2024, 1, 15),
        )
        db.add(app)
        await db.flush()

        # Add round with media
        round1 = Round(
            application_id=app.id,
            round_type_id=test_round_types[0].id,
            scheduled_at=datetime(2024, 1, 20, 10, 0),
            completed_at=datetime(2024, 1, 20, 10, 30),
            outcome="Passed",
            notes_summary="Great interview",
        )
        db.add(round1)
        await db.flush()

        media1 = RoundMedia(
            round_id=round1.id,
            file_path="/media/interview.mp4",
            media_type=MediaType.VIDEO,
        )
        db.add(media1)

        await db.commit()

        # Export
        response = await client.get("/api/export/zip", headers=auth_headers)
        assert response.status_code == 200

        zip_bytes = await response.aread()

        # Verify the exported JSON contains media metadata (new format)
        import zipfile
        import io
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            data = json.loads(zf.read("data.json"))
            # New format uses "models" with model names as keys
            assert "models" in data
            assert "Application" in data["models"]
            assert len(data["models"]["Application"]) > 0
            app_data = data["models"]["Application"][0]
            # Relationships are included directly (not with __rel__ prefix since prefix is empty)
            assert "rounds" in app_data
            assert len(app_data["rounds"]) > 0
            round_data = app_data["rounds"][0]
            # Note: media is NOT nested in round_data since nested relationships
            # are not serialized (only first level). RoundMedia is exported
            # separately in models["RoundMedia"].
            assert "RoundMedia" in data["models"]
            assert len(data["models"]["RoundMedia"]) > 0

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp.write(zip_bytes)
            temp_zip_path = tmp.name

        try:
            # Delete original data
            await db.delete(app)
            await db.commit()

            # Import
            with open(temp_zip_path, "rb") as f:
                import_data = {"file": ("test_export.zip", f, "application/zip")}

                response = await client.post(
                    "/api/import/import",
                    files=import_data,
                    headers=auth_headers,
                    data={"override": "false"},
                )

            assert response.status_code == 200

            # Wait for import to complete
            await asyncio.sleep(3)

            # Verify rounds were imported (media won't be imported since files don't exist)
            result = await db.execute(
                select(Application)
                .options(selectinload(Application.rounds).selectinload(Round.media))
                .where(Application.user_id == user_id)
                .where(Application.company == "RoundTest Company")
            )
            imported_app = result.scalar_one_or_none()

            assert imported_app is not None
            assert len(imported_app.rounds) == 1
            assert imported_app.rounds[0].outcome == "Passed"
            # Media files won't be imported since they don't exist in the ZIP
            # (ZIP export only includes files that actually exist on disk)

        finally:
            os.unlink(temp_zip_path)


class TestImportEdgeCases:
    """Test edge cases and error scenarios."""

    async def test_import_with_missing_optional_fields(
        self, client: AsyncClient, import_user: dict, db: AsyncSession
    ):
        """Test import works when optional fields are missing."""
        user_id = import_user["user_id"]

        # Create import with minimal required fields (job_title is required)
        import_data = {
            "user": {"id": str(user_id), "email": "import@example.com"},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [
                {
                    "company": "Minimal Company",
                    "job_title": "Test Job",  # Required field
                    "status": "Wishlist",
                    "applied_at": "2024-01-25",
                    "status_history": [],
                    "rounds": [],
                }
            ],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr("data.json", json.dumps(import_data))
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
            f.write(zip_bytes)
            temp_zip_path = f.name

        try:
            with open(temp_zip_path, "rb") as f:
                response = await client.post(
                    "/api/import/import",
                    files={"file": ("import.zip", f, "application/zip")},
                    headers=import_user,
                    data={"override": "false"},
                )

            assert response.status_code == 200

            # Wait for import to complete
            await asyncio.sleep(2)

            # Verify application was created with optional fields as None
            result = await db.execute(
                select(Application)
                .where(Application.user_id == user_id)
                .where(Application.company == "Minimal Company")
            )
            app = result.scalar_one_or_none()
            assert app is not None
            assert app.job_title == "Test Job"  # Required field provided
            assert app.job_description is None  # Optional field not provided
            assert app.job_url is None  # Optional field not provided
            assert app.cv_path is None  # Optional field not provided

        finally:
            os.unlink(temp_zip_path)

    async def test_import_with_empty_arrays(
        self, client: AsyncClient, import_user: dict, db: AsyncSession
    ):
        """Test import handles empty arrays correctly."""
        user_id = import_user["user_id"]

        import_data = {
            "user": {"id": str(user_id), "email": "import@example.com"},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr("data.json", json.dumps(import_data))
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
            f.write(zip_bytes)
            temp_zip_path = f.name

        try:
            with open(temp_zip_path, "rb") as f:
                response = await client.post(
                    "/api/import/import",
                    files={"file": ("import.zip", f, "application/zip")},
                    headers=import_user,
                    data={"override": "false"},
                )

            assert response.status_code == 200

        finally:
            os.unlink(temp_zip_path)

    async def test_import_with_large_description(
        self, client: AsyncClient, import_user: dict, db: AsyncSession
    ):
        """Test import handles large job descriptions."""
        user_id = import_user["user_id"]

        # Create a very long description
        large_description = "This is a long job description. " * 100  # ~3500 characters

        import_data = {
            "user": {"id": str(user_id), "email": "import@example.com"},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [
                {
                    "company": "LargeDesc Company",
                    "job_title": "Senior Developer",
                    "job_description": large_description,
                    "status": "Applied",
                    "applied_at": "2024-01-25",
                    "status_history": [],
                    "rounds": [],
                }
            ],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr("data.json", json.dumps(import_data))
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
            f.write(zip_bytes)
            temp_zip_path = f.name

        try:
            with open(temp_zip_path, "rb") as f:
                response = await client.post(
                    "/api/import/import",
                    files={"file": ("import.zip", f, "application/zip")},
                    headers=import_user,
                    data={"override": "false"},
                )

            assert response.status_code == 200

            # Wait for import to complete
            await asyncio.sleep(2)

            # Verify description was preserved
            result = await db.execute(
                select(Application)
                .where(Application.user_id == user_id)
                .where(Application.company == "LargeDesc Company")
            )
            app = result.scalar_one_or_none()
            assert app is not None
            assert app.job_description == large_description

        finally:
            os.unlink(temp_zip_path)

    async def test_import_with_special_characters(
        self, client: AsyncClient, import_user: dict, db: AsyncSession
    ):
        """Test import handles special characters in company names and notes."""
        user_id = import_user["user_id"]

        import_data = {
            "user": {"id": str(user_id), "email": "import@example.com"},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [
                {
                    "company": "Company & Partners, LLC",
                    "job_title": "Senior Developer (Remote)",
                    "job_description": "Job with quotes: \"quoted text\" and 'apostrophes'",
                    "status": "Applied",
                    "applied_at": "2024-01-25",
                    "status_history": [
                        {
                            "from_status": None,
                            "to_status": "Applied",
                            "changed_at": "2024-01-25T10:00:00",
                            "note": "Note with émojis 🎉 and spëcial çharacters",
                        }
                    ],
                    "rounds": [],
                }
            ],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr("data.json", json.dumps(import_data))
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
            f.write(zip_bytes)
            temp_zip_path = f.name

        try:
            with open(temp_zip_path, "rb") as f:
                response = await client.post(
                    "/api/import/import",
                    files={"file": ("import.zip", f, "application/zip")},
                    headers=import_user,
                    data={"override": "false"},
                )

            assert response.status_code == 200

            # Wait for import to complete
            await asyncio.sleep(2)

            # Verify special characters were preserved
            result = await db.execute(
                select(Application)
                .options(selectinload(Application.status_history))
                .where(Application.user_id == user_id)
            )
            apps = result.scalars().all()
            app = next((a for a in apps if "Partners" in a.company), None)

            assert app is not None
            assert "&" in app.company
            assert "(" in app.job_title
            assert "quoted text" in app.job_description
            assert len(app.status_history) > 0

        finally:
            os.unlink(temp_zip_path)

    async def test_import_with_null_dates(
        self, client: AsyncClient, import_user: dict, db: AsyncSession, test_round_types: list[RoundType]
    ):
        """Test import handles null dates in rounds."""
        user_id = import_user["user_id"]

        # Create a status first
        status = ApplicationStatus(name="Null Date Status", color="#FF00FF", is_default=False, order=1, user_id=user_id)
        db.add(status)
        await db.commit()

        import_data = {
            "user": {"id": str(user_id), "email": "import@example.com"},
            "custom_statuses": [],
            "custom_round_types": [],
            "applications": [
                {
                    "company": "NullDate Company",
                    "job_title": "Test Job",
                    "status": "Null Date Status",
                    "applied_at": "2024-01-25",
                    "status_history": [],
                    "rounds": [
                        {
                            "type": test_round_types[0].name,
                            "scheduled_at": None,
                            "completed_at": None,
                            "outcome": None,
                            "notes_summary": None,
                            "media": [],
                        }
                    ],
                }
            ],
        }

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr("data.json", json.dumps(import_data))
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
            f.write(zip_bytes)
            temp_zip_path = f.name

        try:
            with open(temp_zip_path, "rb") as f:
                response = await client.post(
                    "/api/import/import",
                    files={"file": ("import.zip", f, "application/zip")},
                    headers=import_user,
                    data={"override": "false"},
                )

            assert response.status_code == 200

            # Wait for import to complete
            await asyncio.sleep(2)

            # Verify null dates were handled
            result = await db.execute(
                select(Application)
                .options(selectinload(Application.rounds))
                .where(Application.user_id == user_id)
                .where(Application.company == "NullDate Company")
            )
            app = result.scalar_one_or_none()
            assert app is not None
            assert len(app.rounds) == 1
            assert app.rounds[0].scheduled_at is None
            assert app.rounds[0].completed_at is None
            assert app.rounds[0].outcome is None

        finally:
            os.unlink(temp_zip_path)


# Note: The progress endpoint uses Server-Sent Events (SSE) which is a streaming protocol.
# Testing SSE properly requires specialized client handling for event streams.
# The core import functionality is already tested by TestEndToEnd and TestImportEdgeCases classes.
# Progress tracking is an implementation detail that's tested implicitly by successful imports.
