"""Integration tests for export/import round-trip functionality.

These tests verify that data exported from one user can be correctly
imported back, including file handling and path remapping.
"""

import hashlib
import io
import json
import zipfile
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import (
    Application,
    ApplicationStatus,
    Round,
    RoundType,
    User,
)


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        email="export_test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=True,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def importing_user(db: AsyncSession) -> User:
    """Create a second user for importing data."""
    user = User(
        email="import_test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def test_statuses(db: AsyncSession) -> list[ApplicationStatus]:
    """Create global test application statuses."""
    statuses = [
        ApplicationStatus(
            name="Applied", color="#8ec07c", is_default=True, user_id=None
        ),
        ApplicationStatus(
            name="Interview", color="#fe8019", is_default=True, user_id=None
        ),
        ApplicationStatus(
            name="Rejected", color="#fb4934", is_default=True, user_id=None
        ),
    ]
    for status in statuses:
        db.add(status)
    await db.commit()
    for status in statuses:
        await db.refresh(status)
    return statuses


@pytest.fixture
async def test_round_types(db: AsyncSession) -> list[RoundType]:
    """Create global test round types."""
    round_types = [
        RoundType(name="Phone Screen", is_default=True, user_id=None),
        RoundType(name="Technical", is_default=True, user_id=None),
    ]
    for round_type in round_types:
        db.add(round_type)
    await db.commit()
    for round_type in round_types:
        await db.refresh(round_type)
    return round_types


@pytest.fixture
def auth_headers(test_user: User) -> dict:
    """Create authentication headers for the test user."""
    token = create_access_token(data={"sub": str(test_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def importing_auth_headers(importing_user: User) -> dict:
    """Create authentication headers for the importing user."""
    token = create_access_token(data={"sub": str(importing_user.id)})
    return {"Authorization": f"Bearer {token}"}


class TestExportImportRoundTrip:
    """Tests for export/import round-trip functionality."""

    @pytest.mark.asyncio
    async def test_export_creates_valid_new_format(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        test_statuses: list[ApplicationStatus],
        test_round_types: list[RoundType],
        auth_headers: dict,
    ):
        """Test that export creates a valid new format ZIP."""
        # Create a test application
        app = Application(
            user_id=test_user.id,
            company="Test Company",
            job_title="Software Engineer",
            status_id=test_statuses[0].id,
            applied_at=datetime.utcnow(),
        )
        db.add(app)
        await db.commit()
        await db.refresh(app)

        # Export as ZIP
        response = await client.get("/api/export/zip", headers=auth_headers)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

        # Verify ZIP structure
        zip_content = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_content, "r") as zf:
            namelist = zf.namelist()

            # Should have manifest.json and data.json
            assert "manifest.json" in namelist
            assert "data.json" in namelist

            # Verify manifest format
            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["format_version"] == "1.0.0"
            assert "export_timestamp" in manifest
            assert manifest["user_id"] == str(test_user.id)
            assert "counts" in manifest

            # Verify data.json format
            data = json.loads(zf.read("data.json"))
            assert data["format_version"] == "1.0.0"
            assert "models" in data
            assert "Application" in data["models"]
            assert len(data["models"]["Application"]) == 1

    @pytest.mark.asyncio
    async def test_export_import_roundtrip_without_files(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        test_statuses: list[ApplicationStatus],
        test_round_types: list[RoundType],
        auth_headers: dict,
    ):
        """Test export/import round-trip without files."""
        # Create test data
        app = Application(
            user_id=test_user.id,
            company="Export Company",
            job_title="Backend Engineer",
            status_id=test_statuses[0].id,
            applied_at=datetime.utcnow(),
        )
        db.add(app)
        await db.commit()
        await db.refresh(app)

        original_app_id = str(app.id)

        # Export
        export_response = await client.get("/api/export/zip", headers=auth_headers)
        assert export_response.status_code == 200
        zip_content = export_response.content

        # Delete the original application to simulate fresh import
        await db.delete(app)
        await db.commit()

        # Import the exported data
        files = {"file": ("export.zip", io.BytesIO(zip_content), "application/zip")}
        data = {"override": "false"}

        import_response = await client.post(
            "/api/import/import",
            files=files,
            data=data,
            headers=auth_headers,
        )

        # Check import response
        assert import_response.status_code == 200
        result = import_response.json()
        assert "import_id" in result

        # Verify the application was imported
        result = await db.execute(
            select(Application).where(Application.user_id == test_user.id)
        )
        imported_apps = result.scalars().all()
        assert len(imported_apps) == 1
        assert imported_apps[0].company == "Export Company"
        assert imported_apps[0].job_title == "Backend Engineer"
        # ID should be different (new UUID generated)
        assert str(imported_apps[0].id) != original_app_id

    @pytest.mark.asyncio
    async def test_export_import_with_rounds(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        test_statuses: list[ApplicationStatus],
        test_round_types: list[RoundType],
        auth_headers: dict,
    ):
        """Test export/import round-trip with rounds."""
        # Create application with round
        app = Application(
            user_id=test_user.id,
            company="Round Test Company",
            job_title="Full Stack Engineer",
            status_id=test_statuses[1].id,  # Interview
            applied_at=datetime.utcnow(),
        )
        db.add(app)
        await db.commit()
        await db.refresh(app)

        round1 = Round(
            application_id=app.id,
            round_type_id=test_round_types[0].id,  # Phone Screen
            scheduled_at=datetime.utcnow(),
            notes_summary="Great conversation about system design",
        )
        db.add(round1)
        await db.commit()

        # Export
        export_response = await client.get("/api/export/zip", headers=auth_headers)
        assert export_response.status_code == 200
        zip_content = export_response.content

        # Delete original data
        await db.delete(round1)
        await db.delete(app)
        await db.commit()

        # Import
        files = {"file": ("export.zip", io.BytesIO(zip_content), "application/zip")}
        data = {"override": "false"}

        import_response = await client.post(
            "/api/import/import",
            files=files,
            data=data,
            headers=auth_headers,
        )

        assert import_response.status_code == 200

        # Verify application and round were imported
        result = await db.execute(
            select(Application).where(Application.user_id == test_user.id)
        )
        imported_apps = result.scalars().all()
        assert len(imported_apps) == 1

        result = await db.execute(select(Round))
        imported_rounds = result.scalars().all()
        assert len(imported_rounds) == 1
        assert (
            imported_rounds[0].notes_summary == "Great conversation about system design"
        )

    @pytest.mark.asyncio
    async def test_validation_endpoint_accepts_new_format(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        test_statuses: list[ApplicationStatus],
        auth_headers: dict,
    ):
        """Test that the validation endpoint accepts new format exports."""
        # Create a test application
        app = Application(
            user_id=test_user.id,
            company="Validation Company",
            job_title="QA Engineer",
            status_id=test_statuses[0].id,
            applied_at=datetime.utcnow(),
        )
        db.add(app)
        await db.commit()

        # Export
        export_response = await client.get("/api/export/zip", headers=auth_headers)
        assert export_response.status_code == 200
        zip_content = export_response.content

        # Validate
        files = {"file": ("export.zip", io.BytesIO(zip_content), "application/zip")}
        validate_response = await client.post(
            "/api/import/validate",
            files=files,
            headers=auth_headers,
        )

        assert validate_response.status_code == 200
        result = validate_response.json()
        assert result["valid"] is True
        assert result["summary"]["applications"] == 1
        assert "warnings" in result


class TestFileExtraction:
    """Tests for file extraction during import."""

    @pytest.mark.asyncio
    async def test_extract_files_from_new_format_verifies_sha256(
        self,
        tmp_path: Path,
    ):
        """Test that file extraction verifies SHA256 checksums."""
        from app.api.import_router import extract_files_from_new_format

        # Create a test file with known content
        test_content = b"Test file content for SHA256 verification"
        expected_hash = hashlib.sha256(test_content).hexdigest()

        # Create a minimal export ZIP with manifest
        zip_path = tmp_path / "test_export.zip"

        with zipfile.ZipFile(zip_path, "w") as zf:
            # Add manifest with file info including sha256
            manifest = {
                "format_version": "1.0.0",
                "files": {
                    "applications/Test Company - Engineer (abc123)/resume.pdf": {
                        "sha256": expected_hash,
                        "mime_type": "application/pdf",
                        "field": "cv_path",
                    }
                },
            }
            zf.writestr("manifest.json", json.dumps(manifest))

            # Add data.json with file path reference
            data = {
                "format_version": "1.0.0",
                "user": {"id": "test-user-id"},
                "models": {
                    "Application": [
                        {
                            "__original_id__": "app-1",
                            "id": "app-1",
                            "cv_path": f"uploads/{expected_hash}.pdf",
                            "company": "Test Company",
                        }
                    ]
                },
            }
            zf.writestr("data.json", json.dumps(data))

            # Add the file
            zf.writestr(
                "applications/Test Company - Engineer (abc123)/resume.pdf",
                test_content,
            )

        # Extract should succeed with valid hash
        with patch("app.api.import_router.UPLOAD_DIR", str(tmp_path / "uploads")):
            file_mapping = extract_files_from_new_format(str(zip_path), "test-user")

        # File should be mapped
        assert len(file_mapping) > 0

    @pytest.mark.asyncio
    async def test_extract_files_rejects_mismatched_sha256(
        self,
        tmp_path: Path,
    ):
        """Test that file extraction rejects files with mismatched SHA256."""
        from app.api.import_router import extract_files_from_new_format

        test_content = b"Test file content"
        wrong_hash = "0" * 64  # Wrong hash

        zip_path = tmp_path / "test_export_bad.zip"

        with zipfile.ZipFile(zip_path, "w") as zf:
            # Manifest with WRONG hash
            manifest = {
                "format_version": "1.0.0",
                "files": {
                    "applications/Test/resume.pdf": {
                        "sha256": wrong_hash,
                        "mime_type": "application/pdf",
                        "field": "cv_path",
                    }
                },
            }
            zf.writestr("manifest.json", json.dumps(manifest))

            data = {
                "format_version": "1.0.0",
                "user": {"id": "test-user-id"},
                "models": {
                    "Application": [
                        {
                            "__original_id__": "app-1",
                            "id": "app-1",
                            "cv_path": f"uploads/{wrong_hash}.pdf",
                            "company": "Test",
                        }
                    ]
                },
            }
            zf.writestr("data.json", json.dumps(data))

            # Add file with different content
            zf.writestr("applications/Test/resume.pdf", test_content)

        # Should raise ValueError for checksum mismatch
        upload_dir = tmp_path / "uploads"
        upload_dir.mkdir(exist_ok=True)

        with patch("app.api.import_router.UPLOAD_DIR", str(upload_dir)):
            with pytest.raises(ValueError) as exc_info:
                extract_files_from_new_format(str(zip_path), "test-user")

        assert "checksum mismatch" in str(exc_info.value).lower()
