"""Integration tests for export/import round-trip functionality.

These tests verify that data exported from one user can be correctly
imported back, including file handling and path remapping.
"""

import hashlib
import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import pytest
from alembic import command
from alembic.config import Config
from httpx import AsyncClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash
from app.models import (
    Application,
    ApplicationStatus,
    JobLead,
    Round,
    RoundType,
    User,
)
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import extract_import_file_mapping
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService

ALEMBIC_INI_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"


async def wait_for_import_completion(
    client: AsyncClient,
    headers: dict[str, str],
    import_id: str,
    *,
    timeout_seconds: float = 6.0,
) -> dict:
    deadline = __import__("asyncio").get_running_loop().time() + timeout_seconds
    while True:
        response = await client.get(
            f"/api/import/status/{import_id}",
            headers=headers,
        )
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] == "complete":
            return payload
        if payload["status"] == "failed":
            raise AssertionError(f"Import failed unexpectedly: {payload}")
        if __import__("asyncio").get_running_loop().time() >= deadline:
            raise AssertionError(f"Timed out waiting for import {import_id}: {payload}")
        await __import__("asyncio").sleep(0.1)


def run_migrations_on_sync_engine(engine) -> None:
    with engine.begin() as connection:
        cfg = Config(str(ALEMBIC_INI_PATH))
        cfg.set_main_option(
            "sqlalchemy.url",
            engine.url.render_as_string(hide_password=False).replace("%", "%%"),
        )
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")


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
    token = create_access_token(
        data={"sub": str(test_user.id), "session_version": test_user.session_version}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def importing_auth_headers(importing_user: User) -> dict:
    """Create authentication headers for the importing user."""
    token = create_access_token(
        data={
            "sub": str(importing_user.id),
            "session_version": importing_user.session_version,
        }
    )
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
            applied_at=datetime.now(UTC),
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
            assert manifest["format_version"] == "2.0.0"
            assert "export_timestamp" in manifest
            assert manifest["user_id"] == str(test_user.id)
            assert "counts" in manifest

            # Verify data.json format
            data = json.loads(zf.read("data.json"))
            assert data["format_version"] == "2.0.0"
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
        user_id = test_user.id

        # Create test data
        app = Application(
            user_id=user_id,
            company="Export Company",
            job_title="Backend Engineer",
            status_id=test_statuses[0].id,
            applied_at=datetime.now(UTC),
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
        assert import_response.status_code == 202
        result = import_response.json()
        assert "import_id" in result

        await wait_for_import_completion(client, auth_headers, result["import_id"])
        await db.rollback()

        # Verify the application was imported
        result = await db.execute(
            select(Application).where(Application.user_id == user_id)
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
        user_id = test_user.id

        # Create application with round
        app = Application(
            user_id=user_id,
            company="Round Test Company",
            job_title="Full Stack Engineer",
            status_id=test_statuses[1].id,  # Interview
            applied_at=datetime.now(UTC),
        )
        db.add(app)
        await db.commit()
        await db.refresh(app)

        round1 = Round(
            application_id=app.id,
            round_type_id=test_round_types[0].id,  # Phone Screen
            scheduled_at=datetime.now(UTC),
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

        assert import_response.status_code == 202
        import_id = import_response.json()["import_id"]

        await wait_for_import_completion(client, auth_headers, import_id)
        await db.rollback()

        # Verify application and round were imported
        result = await db.execute(
            select(Application).where(Application.user_id == user_id)
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
            applied_at=datetime.now(UTC),
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


class TestImportIntegrityGuards:
    async def test_test_db_enforces_sqlite_foreign_keys(self, db: AsyncSession):
        user = User(
            email="fk-harness@example.com", password_hash="hashed", is_active=True
        )
        db.add(user)
        await db.flush()

        db.add(
            Application(
                user_id=user.id,
                company="Acme",
                job_title="Engineer",
                status_id="missing-status-id",
            )
        )

        with pytest.raises(IntegrityError):
            await db.flush()

        await db.rollback()

    def test_import_service_preserves_converted_job_lead_links_with_fk_enforcement(
        self,
    ):
        def make_engine():
            engine = create_engine("sqlite:///:memory:")

            @event.listens_for(engine, "connect")
            def set_sqlite_pragma(dbapi_connection, connection_record):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

            return engine

        source_engine = make_engine()
        run_migrations_on_sync_engine(source_engine)

        with Session(source_engine) as session:
            user = User(
                email="source@example.com", password_hash="hashed", is_active=True
            )
            session.add(user)
            session.flush()

            status = ApplicationStatus(
                name="Applied",
                color="#83a598",
                is_default=False,
                user_id=user.id,
                order=1,
            )
            session.add(status)
            session.flush()

            job_lead = JobLead(
                user_id=user.id,
                status="converted",
                title="Engineer",
                company="Acme",
                url="https://example.com/jobs/1",
                description="Lead description",
                scraped_at=datetime.now(UTC),
                requirements_must_have=[],
                requirements_nice_to_have=[],
                skills=[],
            )
            session.add(job_lead)
            session.flush()

            application = Application(
                user_id=user.id,
                company="Acme",
                job_title="Engineer",
                job_description="Canonical description",
                status_id=status.id,
                applied_at=datetime.now(UTC),
                job_lead_id=job_lead.id,
            )
            session.add(application)
            session.flush()

            job_lead.converted_to_application_id = application.id
            session.commit()

            export_data = ExportService(default_registry).export_user_data(
                user.id, session
            )

        target_engine = make_engine()
        run_migrations_on_sync_engine(target_engine)

        with Session(target_engine) as session:
            importing_user = User(
                email="import@example.com", password_hash="hashed", is_active=True
            )
            session.add(importing_user)
            session.commit()
            importing_user_id = importing_user.id

        with Session(target_engine) as session:
            import_result = ImportService(
                registry=default_registry, id_mapper=IDMapper()
            ).import_user_data(
                export_data=export_data,
                user_id=importing_user_id,
                session=session,
            )
            session.commit()

            assert import_result["warnings"] == []

            imported_application = session.execute(select(Application)).scalar_one()
            imported_job_lead = session.execute(select(JobLead)).scalar_one()

            assert imported_application.job_lead_id == imported_job_lead.id
            assert (
                imported_job_lead.converted_to_application_id == imported_application.id
            )

    def test_import_service_maps_legacy_application_description_to_job_description(
        self,
    ):
        def make_engine():
            engine = create_engine("sqlite:///:memory:")

            @event.listens_for(engine, "connect")
            def set_sqlite_pragma(dbapi_connection, connection_record):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

            return engine

        engine = make_engine()
        run_migrations_on_sync_engine(engine)

        export_data = {
            "format_version": "1.0.0",
            "models": {
                "ApplicationStatus": [
                    {
                        "__original_id__": "status-1",
                        "id": "status-1",
                        "name": "Applied",
                        "color": "#83a598",
                        "is_default": True,
                        "user_id": None,
                        "order": 0,
                    }
                ],
                "Application": [
                    {
                        "__original_id__": "app-1",
                        "id": "app-1",
                        "company": "Acme",
                        "job_title": "Engineer",
                        "description": "Legacy exported description",
                        "job_url": "https://example.com/jobs/1",
                        "status_id": "status-1",
                        "applied_at": "2026-04-09",
                        "requirements_must_have": [],
                        "requirements_nice_to_have": [],
                        "skills": [],
                    }
                ],
            },
        }

        with Session(engine) as session:
            user = User(
                email="legacy-import@example.com",
                password_hash="hashed",
                is_active=True,
            )
            session.add(user)
            session.commit()

            import_result = ImportService(
                registry=default_registry, id_mapper=IDMapper()
            ).import_user_data(
                export_data=export_data,
                user_id=user.id,
                session=session,
            )
            session.commit()

            assert import_result["warnings"] == []
            imported_application = session.execute(select(Application)).scalar_one()
            assert imported_application.job_description == "Legacy exported description"

    def test_new_format_file_mapping_maps_all_legacy_paths_for_duplicate_content(
        self, tmp_path: Path
    ):
        content = b"duplicate-content"
        content_hash = hashlib.sha256(content).hexdigest()
        old_cv_path = f"uploads/{content_hash}.pdf"
        old_cover_letter_path = f"uploads/legacy-user/{content_hash}.pdf"

        export_data = {
            "format_version": "1.0.0",
            "models": {
                "Application": [
                    {
                        "id": "app-1",
                        "cv_path": old_cv_path,
                        "cover_letter_path": old_cover_letter_path,
                    }
                ],
                "Round": [],
                "RoundMedia": [],
            },
        }

        manifest = {
            "files": {
                "applications/App One/resume.pdf": {
                    "sha256": content_hash,
                    "mime_type": "application/pdf",
                    "field": "cv_path",
                },
                "applications/App One/cover_letter.pdf": {
                    "sha256": content_hash,
                    "mime_type": "application/pdf",
                    "field": "cover_letter_path",
                },
            }
        }

        zip_path = tmp_path / "duplicate-export.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            zipf.writestr("manifest.json", json.dumps(manifest))
            zipf.writestr("data.json", json.dumps(export_data))
            zipf.writestr("applications/App One/resume.pdf", content)
            zipf.writestr("applications/App One/cover_letter.pdf", content)

        with patch("app.services.import_execution.UPLOAD_DIR", str(tmp_path)):
            file_mapping = extract_import_file_mapping(
                str(zip_path), "user-1", export_data
            )

        assert old_cv_path in file_mapping
        assert old_cover_letter_path in file_mapping
        assert file_mapping[old_cv_path] == file_mapping[old_cover_letter_path]


class TestFileExtraction:
    """Tests for file extraction during import."""

    @pytest.mark.asyncio
    async def test_extract_files_from_new_format_verifies_sha256(
        self,
        tmp_path: Path,
    ):
        """Test that file extraction verifies SHA256 checksums."""
        from app.services.import_execution import extract_files_from_new_format

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
        with patch(
            "app.services.import_execution.UPLOAD_DIR", str(tmp_path / "uploads")
        ):
            file_mapping = extract_files_from_new_format(str(zip_path), "test-user")

        # File should be mapped
        assert len(file_mapping) > 0

    @pytest.mark.asyncio
    async def test_extract_files_rejects_mismatched_sha256(
        self,
        tmp_path: Path,
    ):
        """Test that file extraction rejects files with mismatched SHA256."""
        from app.services.import_execution import extract_files_from_new_format

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

        with patch("app.services.import_execution.UPLOAD_DIR", str(upload_dir)):
            with pytest.raises(ValueError) as exc_info:
                extract_files_from_new_format(str(zip_path), "test-user")

        assert "checksum mismatch" in str(exc_info.value).lower()


@pytest.mark.parametrize("export_format", ["json", "zip"])
async def test_export_excludes_foreign_records_and_secrets_throughout_tree(
    client,
    db,
    test_user,
    importing_user,
    test_statuses,
    test_round_types,
    auth_headers,
    export_format,
    tmp_path,
    monkeypatch,
):
    from app.core.config import get_settings
    from app.models import ApplicationStatusHistory, RoundMedia, UserProfile
    from app.models.system_settings import SystemSettings
    from app.models.user_api_key import UserAPIKey

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setattr(get_settings(), "upload_dir", str(uploads))
    # ZIP exports fail on missing attachments instead of silently omitting them.
    (uploads / "owned-media.mp3").write_bytes(b"owned synthetic archive bytes")
    (uploads / "foreign-media.mp3").write_bytes(b"foreign synthetic archive bytes")
    test_user.settings = {
        "theme": "dracula",
        "show_heatmap": False,
        "litellm_api_key": "legacy-ai-secret",
        "unknown": {"api_key": "nested-secret"},
    }
    forbidden_values = {
        importing_user.id,
        importing_user.email,
        test_user.password_hash,
        importing_user.password_hash,
        "legacy-ai-secret",
        "nested-secret",
        "shared-ai-secret",
    }
    for user in [test_user, importing_user]:
        marker = "owned" if user == test_user else "foreign"
        custom_status = ApplicationStatus(user_id=user.id, name=f"{marker} status")
        custom_type = RoundType(user_id=user.id, name=f"{marker} type")
        profile = UserProfile(
            user_id=user.id, first_name=f"{marker} profile", skills=["Python"]
        )
        api_key = UserAPIKey(
            user_id=user.id,
            label=marker,
            key_prefix=f"{marker}-prefix",
            key_hash=f"{marker}-api-hash",
        )
        lead = JobLead(
            user_id=user.id, url=f"https://example.com/{marker}", title=f"{marker} lead"
        )
        db.add_all([custom_status, custom_type, profile, api_key, lead])
        application = Application(
            user_id=user.id,
            company=f"{marker} company",
            job_title="Engineer",
            status_id=test_statuses[0].id,
        )
        db.add(application)
        await db.flush()
        round_obj = Round(
            application_id=application.id,
            round_type_id=test_round_types[0].id,
            notes_summary=f"{marker} interview",
        )
        history = ApplicationStatusHistory(
            application_id=application.id,
            to_status_id=test_statuses[0].id,
            note=f"{marker} history",
        )
        db.add_all([round_obj, history])
        await db.flush()
        media = RoundMedia(
            round_id=round_obj.id,
            file_path=f"uploads/{marker}-media.mp3",
            media_type="audio",
        )
        db.add(media)
        await db.flush()
        forbidden_values.update([api_key.key_hash, api_key.key_prefix])
        if user == importing_user:
            forbidden_values.update(
                obj.id
                for obj in [
                    custom_status,
                    custom_type,
                    profile,
                    api_key,
                    lead,
                    application,
                    round_obj,
                    history,
                    media,
                ]
            )
            forbidden_values.update(
                [
                    "foreign company",
                    "foreign interview",
                    "foreign history",
                    "foreign profile",
                    "foreign lead",
                    "foreign status",
                    "foreign type",
                    "uploads/foreign-media.mp3",
                ]
            )
    db.add(
        SystemSettings(key=SystemSettings.KEY_LITELLM_API_KEY, value="shared-ai-secret")
    )
    await db.commit()

    response = await client.get(f"/api/export/{export_format}", headers=auth_headers)
    assert response.status_code == 200
    if export_format == "zip":
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            tree = {
                name: json.loads(archive.read(name))
                for name in archive.namelist()
                if name.endswith(".json")
            }
        data = tree["data.json"]
    else:
        tree = data = response.json()
    serialized = json.dumps(tree)
    leaks = [value for value in forbidden_values if value in serialized]
    forbidden_keys = [
        "password_hash",
        "session_version",
        "owner_bootstrapped",
        "key_hash",
        "key_prefix",
        "api_keys",
        "litellm_api_key",
        "api_key",
    ]
    leaks.extend(key for key in forbidden_keys if f'"{key}"' in serialized)
    assert leaks == []
    assert data["models"]["User"][0]["settings"]["theme"] == "dracula"
    assert data["models"]["User"][0]["settings"]["show_heatmap"] is False
    assert data["models"]["UserProfile"][0]["skills"] == ["Python"]
    for model in [
        "Application",
        "Round",
        "RoundMedia",
        "ApplicationStatusHistory",
        "JobLead",
    ]:
        assert len(data["models"][model]) == 1
    assert {s["name"] for s in data["models"]["ApplicationStatus"]} == {
        "Applied",
        "Interview",
        "Rejected",
        "owned status",
    }


@pytest.mark.parametrize(
    "field", ["cv_path", "cover_letter_path", "transcript_path", "file_path"]
)
async def test_import_rejects_known_foreign_attachment_path(
    client,
    db,
    test_user,
    importing_user,
    test_statuses,
    test_round_types,
    importing_auth_headers,
    tmp_path,
    monkeypatch,
    field,
):
    from app.core.config import get_settings
    from app.models import RoundMedia

    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    foreign_path = "uploads/foreign-known-blob.txt"
    (tmp_path / "foreign-known-blob.txt").write_bytes(b"foreign confidential document")
    foreign = Application(
        user_id=test_user.id,
        company="Foreign",
        job_title="Engineer",
        status_id=test_statuses[0].id,
        cv_path=foreign_path,
    )
    db.add(foreign)
    await db.commit()
    owner_id = importing_user.id
    models = {
        "Application": [
            {
                "id": "app",
                "__original_id__": "app",
                "company": "Forged",
                "job_title": "Engineer",
                "status_id": test_statuses[0].id,
            }
        ],
        "Round": [
            {
                "id": "round",
                "__original_id__": "round",
                "application_id": "app",
                "round_type_id": test_round_types[0].id,
            }
        ],
    }
    if field == "file_path":
        models["RoundMedia"] = [
            {"round_id": "round", "media_type": "audio", field: foreign_path}
        ]
    else:
        models["Round" if field == "transcript_path" else "Application"][0][field] = (
            foreign_path
        )
    payload = {"format_version": "1.0.0", "models": models}
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("data.json", json.dumps(payload))
        zf.writestr("manifest.json", json.dumps({"files": {}}))
    response = await client.post(
        "/api/import/import",
        headers=importing_auth_headers,
        files={"file": ("forged.zip", archive.getvalue(), "application/zip")},
    )
    assert response.status_code == 202
    result = await client.get(
        f"/api/import/status/{response.json()['import_id']}",
        headers=importing_auth_headers,
    )
    assert result.json()["status"] == "failed"
    assert "Expected file not found in export" in result.json()["message"]
    await db.rollback()
    assert (
        not (
            await db.execute(select(Application).where(Application.user_id == owner_id))
        )
        .scalars()
        .all()
    )
    assert not (await db.execute(select(RoundMedia))).scalars().all()


async def test_archive_roundtrip_remaps_all_attachment_kinds(
    client,
    db,
    test_user,
    importing_user,
    test_statuses,
    test_round_types,
    auth_headers,
    importing_auth_headers,
    tmp_path,
    monkeypatch,
):
    from app.core.config import get_settings, resolve_upload_path
    from app.models import RoundMedia

    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    monkeypatch.setattr("app.services.import_execution.UPLOAD_DIR", str(tmp_path))
    contents = {
        "resume.txt": b"Personal CV",
        "letter.txt": b"Cover letter",
        "transcript.txt": b"Interview transcript",
        "recording.wav": b"RIFF"
        + (36).to_bytes(4, "little")
        + b"WAVEfmt "
        + (16).to_bytes(4, "little")
        + b"\x01\x00\x01\x00\x40\x1f\x00\x00\x80\x3e\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00",
    }
    for filename, content in contents.items():
        (tmp_path / filename).write_bytes(content)
    application = Application(
        user_id=test_user.id,
        company="Portable",
        job_title="Engineer",
        status_id=test_statuses[0].id,
        cv_path="uploads/resume.txt",
        cover_letter_path="uploads/letter.txt",
        salary_min=85500,
        job_description="Keep this description",
    )
    db.add(application)
    await db.flush()
    round_obj = Round(
        application_id=application.id,
        round_type_id=test_round_types[0].id,
        transcript_path="uploads/transcript.txt",
        transcript_summary="Keep this summary",
    )
    db.add(round_obj)
    await db.flush()
    media = RoundMedia(
        round_id=round_obj.id,
        file_path="uploads/recording.wav",
        media_type="audio",
        original_filename="conversation.wav",
    )
    db.add(media)
    await db.commit()
    owner_id = importing_user.id
    original_credentials = (
        importing_user.password_hash,
        importing_user.session_version,
        importing_user.is_admin,
    )
    original_ids = {application.id, round_obj.id, media.id}
    exported = await client.get("/api/export/zip", headers=auth_headers)
    assert exported.status_code == 200
    with zipfile.ZipFile(io.BytesIO(exported.content)) as zf:
        assert any("01 - Phone Screen/" in name for name in zf.namelist())
        assert len(json.loads(zf.read("manifest.json"))["files"]) == 4
    # Submitted authentication metadata is not a credential-recovery/import path.
    altered = io.BytesIO()
    with (
        zipfile.ZipFile(io.BytesIO(exported.content)) as source,
        zipfile.ZipFile(altered, "w") as target,
    ):
        payload = json.loads(source.read("data.json"))
        assert "session_version" not in payload["models"]["User"][0]
        payload["models"]["User"][0].update(
            session_version=999, password_hash="injected-hash", is_admin=True
        )
        content = json.dumps(payload).encode()
        manifest = json.loads(source.read("manifest.json"))
        manifest["checksums"]["data.json"] = (
            "sha256:" + hashlib.sha256(content).hexdigest()
        )
        for name in source.namelist():
            if name not in ("data.json", "manifest.json"):
                target.writestr(name, source.read(name))
        target.writestr("data.json", content)
        target.writestr("manifest.json", json.dumps(manifest))
    imported = await client.post(
        "/api/import/import",
        headers=importing_auth_headers,
        files={"file": ("archive.zip", altered.getvalue(), "application/zip")},
    )
    assert imported.status_code == 202
    await wait_for_import_completion(
        client, importing_auth_headers, imported.json()["import_id"]
    )
    await db.rollback()
    imported_owner = await db.get(User, owner_id)
    assert imported_owner is not None
    assert (
        imported_owner.password_hash,
        imported_owner.session_version,
        imported_owner.is_admin,
    ) == original_credentials
    new_app = (
        await db.execute(select(Application).where(Application.user_id == owner_id))
    ).scalar_one()
    new_round = (
        await db.execute(select(Round).where(Round.application_id == new_app.id))
    ).scalar_one()
    new_media = (
        await db.execute(select(RoundMedia).where(RoundMedia.round_id == new_round.id))
    ).scalar_one()
    assert not original_ids.intersection({new_app.id, new_round.id, new_media.id})
    assert new_app.salary_min == 85500
    assert new_app.job_description == "Keep this description"
    assert new_round.transcript_summary == "Keep this summary"
    for stored_path, filename, path in [
        (new_app.cv_path, "resume.txt", f"/api/files/{new_app.id}/cv"),
        (
            new_app.cover_letter_path,
            "letter.txt",
            f"/api/files/{new_app.id}/cover-letter",
        ),
        (
            new_round.transcript_path,
            "transcript.txt",
            f"/api/files/rounds/{new_round.id}/transcript",
        ),
        (new_media.file_path, "recording.wav", f"/api/files/media/{new_media.id}"),
    ]:
        assert stored_path != f"uploads/{filename}"
        assert hashlib.sha256(contents[filename]).hexdigest() in stored_path
        assert Path(resolve_upload_path(stored_path)).read_bytes() == contents[filename]
        response = await client.get(path, headers=importing_auth_headers)
        assert response.status_code == 200
        assert response.content == contents[filename]
