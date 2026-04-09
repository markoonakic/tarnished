import hashlib
import json
import zipfile
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models import Application, ApplicationStatus, RoundType, User
from app.services.import_execution import (
    extract_import_file_mapping,
    import_payload_data,
)


@pytest.mark.asyncio
async def test_import_payload_data_maps_new_format_counts(db):
    user = User(email="import-exec@example.com", password_hash="hashed", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    data = {"format_version": "1.0.0", "models": {}}

    def run_sync_stub(func, *args):
        return func(None, *args)

    db.run_sync = AsyncMock(side_effect=run_sync_stub)  # type: ignore[method-assign]

    with patch(
        "app.services.import_execution._run_import_user_data",
        return_value={
            "counts": {
                "Application": 2,
                "Round": 3,
                "ApplicationStatusHistory": 4,
                "ApplicationStatus": 1,
                "RoundType": 1,
                "RoundMedia": 5,
            },
            "warnings": ["warning"],
        },
    ) as mock_run:
        result = await import_payload_data(
            db,
            str(user.id),
            data,
            {"a": "b"},
            lambda **_: None,
        )

    mock_run.assert_called_once()
    assert result == {
        "applications": 2,
        "rounds": 3,
        "status_history": 4,
        "statuses": 1,
        "round_types": 1,
        "media": 5,
        "warnings": ["warning"],
    }


@pytest.mark.asyncio
async def test_import_payload_data_imports_legacy_custom_metadata(db):
    user = User(
        email="legacy-import-exec@example.com", password_hash="hashed", is_active=True
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    data = {
        "user": {"email": "legacy@example.com"},
        "custom_statuses": [
            {
                "name": "Custom Status",
                "color": "#123456",
                "is_default": False,
                "order": 3,
            }
        ],
        "custom_round_types": [{"name": "Panel", "is_default": False}],
        "applications": [],
    }

    with patch(
        "app.services.import_execution.import_applications",
        new=AsyncMock(
            return_value={"applications": 0, "rounds": 0, "status_history": 0}
        ),
    ):
        result = await import_payload_data(
            db,
            str(user.id),
            data,
            {},
            lambda **_: None,
        )

    statuses = await db.execute(
        __import__("sqlalchemy")
        .select(ApplicationStatus)
        .where(ApplicationStatus.user_id == user.id)
    )
    round_types = await db.execute(
        __import__("sqlalchemy").select(RoundType).where(RoundType.user_id == user.id)
    )

    assert statuses.scalar_one().name == "Custom Status"
    assert round_types.scalar_one().name == "Panel"
    assert result == {"applications": 0, "rounds": 0, "status_history": 0}


@pytest.mark.asyncio
async def test_import_payload_data_prefers_user_status_override_over_global(db):
    user = User(email="status-override@example.com", password_hash="hashed", is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    global_status = ApplicationStatus(
        name="Applied",
        color="#83a598",
        is_default=True,
        user_id=None,
        order=0,
    )
    user_status = ApplicationStatus(
        name="Applied",
        color="#00ff00",
        is_default=False,
        user_id=user.id,
        order=0,
    )
    db.add_all([global_status, user_status])
    await db.commit()
    await db.refresh(user_status)

    data = {
        "user": {"email": user.email},
        "custom_statuses": [],
        "custom_round_types": [],
        "applications": [
            {
                "id": "legacy-app-1",
                "company": "Acme",
                "job_title": "Engineer",
                "job_description": "Description",
                "job_url": "https://example.com/jobs/1",
                "status": "Applied",
                "cv_path": None,
                "applied_at": "2026-04-09",
                "status_history": [],
                "rounds": [],
            }
        ],
    }

    result = await import_payload_data(db, str(user.id), data, {}, lambda **_: None)

    imported_application = (
        await db.execute(select(Application).where(Application.user_id == user.id))
    ).scalar_one()

    assert imported_application.status_id == user_status.id
    assert result["applications"] == 1


def test_extract_import_file_mapping_uses_new_format_manifest(tmp_path):
    zip_path = tmp_path / "import.zip"
    data = {"format_version": "1.0.0", "models": {}}
    data_json = json.dumps(data).encode()
    manifest = {
        "files": {},
        "checksums": {"data.json": f"sha256:{hashlib.sha256(data_json).hexdigest()}"},
    }

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr("manifest.json", json.dumps(manifest))
        zipf.writestr("data.json", data_json)

    with (
        patch(
            "app.services.import_execution.extract_files_from_new_format",
            return_value={"old": "new"},
        ) as new_format_extract,
        patch(
            "app.services.import_execution.extract_files_from_zip",
            return_value={"old": "legacy"},
        ) as legacy_extract,
    ):
        result = extract_import_file_mapping(str(zip_path), "user-1", data)

    new_format_extract.assert_called_once_with(str(zip_path), "user-1")
    legacy_extract.assert_not_called()
    assert result == {"old": "new"}
