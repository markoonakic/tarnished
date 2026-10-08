"""Independent application files; never used as AI evidence."""

import hashlib
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.utils.upload_route import UploadLimitRoute
from app.api.utils.zip_utils import (
    ALLOWED_DOCUMENT_TYPES,
    sanitize_filename,
    store_file,
    validate_file,
)
from app.api.workspace import DB, Owner
from app.core.config import get_settings, resolve_upload_path
from app.models import Application
from app.models.workspace import ApplicationDocument
from app.services.ai_settings import lock_ai_settings
from app.services.workspace import audit, owned, record_dict

router = APIRouter(prefix="/api", tags=["attachments"], route_class=UploadLimitRoute)


def attachment(row):
    return record_dict(row, exclude={"file_path"})


@router.get("/applications/{application_id}/attachments")
async def attachments(application_id: str, db: DB, user: Owner):
    await owned(db, Application, application_id, user.id)
    return [
        attachment(row)
        for row in await db.scalars(
            select(ApplicationDocument)
            .where(
                ApplicationDocument.user_id == user.id,
                ApplicationDocument.application_id == application_id,
            )
            .order_by(ApplicationDocument.uploaded_at.desc())
        )
    ]


@router.post("/applications/{application_id}/attachments", status_code=201)
async def upload_attachment(
    application_id: str,
    file: UploadFile,
    db: DB,
    user: Owner,
    kind: Literal["portfolio", "task", "solution", "other"] = Form(...),
):
    app = await owned(db, Application, application_id, user.id)
    settings = get_settings()
    maximum = settings.max_document_size_mb * 1024 * 1024
    content = await file.read(maximum + 1)
    if not content or len(content) > maximum:
        raise HTTPException(413, "Empty file or document size limit exceeded")
    with tempfile.NamedTemporaryFile() as temporary:
        temporary.write(content)
        temporary.flush()
        valid, mime = validate_file(Path(temporary.name), ALLOWED_DOCUMENT_TYPES)
    if not valid:
        raise HTTPException(422, "Unsupported document type")
    await lock_ai_settings(db)
    path = store_file(content, Path(settings.upload_dir))
    row = ApplicationDocument(
        user_id=user.id,
        application_id=app.id,
        kind=kind,
        original_filename=sanitize_filename(file.filename or "document"),
        media_type=mime,
        byte_count=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        file_path=path,
    )
    db.add(row)
    await db.flush()
    await audit(db, user.id, "document.created", row)
    await db.commit()
    return attachment(row)


@router.get("/attachments/{record_id}")
async def download_attachment(record_id: str, db: DB, user: Owner):
    row = await owned(db, ApplicationDocument, record_id, user.id)
    try:
        path = Path(resolve_upload_path(row.file_path))
    except ValueError:
        raise HTTPException(404, "File not found") from None
    if not path.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(
        path,
        filename=row.original_filename,
        media_type="application/octet-stream",
        content_disposition_type="attachment",
    )


@router.delete("/attachments/{record_id}", status_code=204)
async def delete_attachment(record_id: str, db: DB, user: Owner):
    await lock_ai_settings(db)
    row = await owned(db, ApplicationDocument, record_id, user.id)
    await audit(db, user.id, "document.deleted", row)
    # Reference removal is immediate. Shared CAS bytes are reclaimed by the
    # existing offline reference-aware storage cleanup, not an unsafe unlink.
    await db.delete(row)
    await db.commit()
