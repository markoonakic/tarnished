"""Extra file archives and shared content-addressed storage references."""

import json
import zipfile
from pathlib import Path

from sqlalchemy import select
from test_workspace_v030 import owner, post

from app.core.config import get_settings, resolve_upload_path
from app.core.seed import seed_defaults
from app.models import ApplicationStatus
from app.models.workspace import ApplicationDocument
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import extract_files_from_new_format
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService
from app.services.storage_cleanup import build_cleanup_report


async def test_extra_file_archive_roundtrip_and_shared_reference_cleanup(
    client, db, tmp_path, monkeypatch
):
    from app.api.utils.zip_utils import create_zip_export_file

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setattr(get_settings(), "upload_dir", str(uploads))
    await seed_defaults(db)
    user, h = await owner(db, "file-owner@example.com")
    other, oh = await owner(db, "file-importer@example.com")
    status = await db.scalar(
        select(ApplicationStatus.id).where(ApplicationStatus.meaning == "applied")
    )
    app = await post(
        client,
        "/applications",
        {"company": "North", "job_title": "Engineer", "status_id": status},
        h,
    )
    content = b"Portfolio: a small project with a clear purpose.\n" * 20
    response = await client.post(
        f"/api/applications/{app['id']}/attachments",
        headers=h,
        files={"file": ("portfolio.txt", content, "text/plain")},
        data={"kind": "portfolio"},
    )
    assert response.status_code == 201, response.text
    document = response.json()
    assert document["kind"] == "portfolio" and document["byte_count"] == len(content)
    assert "file_path" not in document
    assert (
        await client.get(f"/api/attachments/{document['id']}", headers=oh)
    ).status_code == 404
    assert (
        await client.get(f"/api/attachments/{document['id']}", headers=h)
    ).content == content
    data = await db.run_sync(
        lambda s: ExportService(default_registry).export_user_data(user.id, s)
    )
    archive = await create_zip_export_file(json.dumps(data), user.id, str(uploads))
    try:
        with zipfile.ZipFile(archive) as zipped:
            manifest = json.loads(zipped.read("manifest.json"))
            assert (
                len(
                    [
                        row
                        for row in manifest["files"].values()
                        if row["entity_type"] == "ApplicationDocument"
                    ]
                )
                == 1
            )
        files = extract_files_from_new_format(archive, other.id)
        await db.run_sync(
            lambda s: ImportService(default_registry, IDMapper()).import_user_data(
                data, other.id, s, file_mapping=files
            )
        )
        await db.commit()
    finally:
        Path(archive).unlink(missing_ok=True)
    imported = await db.scalar(
        select(ApplicationDocument).where(ApplicationDocument.user_id == other.id)
    )
    assert imported.kind == "portfolio" and imported.application_id != app["id"]
    shared_path = Path(resolve_upload_path(imported.file_path))
    assert (
        await client.delete(f"/api/attachments/{document['id']}", headers=h)
    ).status_code == 204
    assert shared_path.exists()
    assert (
        await client.get(f"/api/attachments/{imported.id}", headers=oh)
    ).content == content
    assert shared_path not in (await build_cleanup_report(db, uploads)).orphan_paths
    assert (
        await client.delete(f"/api/attachments/{imported.id}", headers=oh)
    ).status_code == 204
    assert shared_path in (await build_cleanup_report(db, uploads)).orphan_paths
