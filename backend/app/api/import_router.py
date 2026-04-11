"""Import validation and execution endpoints.

This module handles the validation and import of user data from ZIP files
containing JSON data and optional media files.
"""

import asyncio
import importlib
import json
import logging
import os
import uuid
import zipfile
from collections.abc import Callable
from pathlib import Path

import aiofiles
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.utils.zip_utils import validate_zip_safety
from app.core.database import async_session_maker, get_db
from app.core.deps import get_current_user, require_api_key_scope
from app.core.rate_limit import limiter
from app.core.security import decode_token
from app.models import AuditLog, User
from app.services.import_execution import (
    clear_existing_import_data,
    extract_import_file_mapping,
    import_payload_data,
    verify_new_format_manifest_checksum,
)
from app.services.import_validation import is_new_export_format, validate_import_payload
from app.services.transfer_jobs import (
    complete_transfer_job,
    create_transfer_job,
    fail_transfer_job,
    get_transfer_job_for_user,
    serialize_transfer_job,
    update_transfer_job_progress,
)

import_schemas = importlib.import_module("app.schemas.import")
ImportValidationResponse = import_schemas.ImportValidationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/import", tags=["import"])

UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1MB
SSE_POLL_MAX_SECONDS = 3600  # 1 hour
SECURE_TEMP_DIR = "/tmp/secure_imports"  # nosec B108 # Intentional secure dir with mode 0o700
os.makedirs(SECURE_TEMP_DIR, mode=0o700, exist_ok=True)


def conditional_rate_limit(limit_string: str):
    """Apply rate limiting only when enabled."""

    def decorator(func: Callable):
        if os.environ.get("ENABLE_RATE_LIMITING", "true").lower() == "false":
            return func
        return limiter.limit(limit_string)(func)

    return decorator


async def log_import_event(
    db: AsyncSession,
    user_id: str,
    event: str,
    details: dict,
    request: Request | None = None,
    ip_address: str | None = None,
) -> None:
    """Log import events for security audit."""
    resolved_ip = ip_address or (
        request.client.host if request and request.client else None
    )
    log = AuditLog(
        user_id=user_id,
        event_type=f"import_{event}",
        details=json.dumps(details),
        ip_address=resolved_ip,
    )
    db.add(log)
    await db.commit()


async def _update_job(
    job_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    percent: int | None = None,
    message: str | None = None,
    result: dict | None = None,
    error: dict | None = None,
) -> None:
    async with async_session_maker() as db:
        await update_transfer_job_progress(
            db,
            job_id=job_id,
            status=status,
            stage=stage,
            percent=percent,
            message=message,
            result=result,
            error=error,
        )


async def _fail_job(
    job_id: str,
    *,
    message: str,
    error: dict,
    stage: str | None = None,
) -> None:
    async with async_session_maker() as db:
        await fail_transfer_job(
            db,
            job_id=job_id,
            message=message,
            error=error,
            stage=stage,
        )


async def _get_job_payload(job_id: str, user_id: str) -> dict | None:
    async with async_session_maker() as db:
        job = await get_transfer_job_for_user(db, job_id=job_id, user_id=user_id)
        if job is None:
            return None
        return serialize_transfer_job(job)


def create_secure_temp_file(original_filename: str) -> str:
    """Create secure temp file with proper permissions."""
    safe_filename = f"{uuid.uuid4()}_{Path(original_filename).name}"
    temp_path = os.path.join(SECURE_TEMP_DIR, safe_filename)
    fd = os.open(temp_path, os.O_WRONLY | os.O_CREAT, 0o600)
    os.close(fd)
    return temp_path


def secure_delete(file_path: str) -> None:
    """Securely delete file by overwriting with random data."""
    try:
        with open(file_path, "wb") as f:
            f.write(os.urandom(os.path.getsize(file_path)))
        os.remove(file_path)
    except Exception:
        try:
            os.remove(file_path)
        except Exception:
            logger.warning("Failed to delete temporary file: %s", file_path)


async def process_import_job(
    *,
    job_id: str,
    user_id: str,
    temp_path: str,
    override: bool,
    filename: str | None,
    ip_address: str | None,
) -> None:
    stage = "validating"
    try:
        await _update_job(
            job_id,
            status="processing",
            stage=stage,
            percent=10,
            message="Validating ZIP file...",
        )
        zip_info = await validate_zip_safety(temp_path)

        with zipfile.ZipFile(temp_path, "r") as zip_ref:
            try:
                data_json = zip_ref.read("data.json")
            except KeyError as exc:
                raise ValueError("ZIP must contain data.json") from exc

            data = json.loads(data_json)
            verify_new_format_manifest_checksum(data, data_json, zip_ref)

        stage = "extracting"
        await _update_job(
            job_id,
            stage=stage,
            percent=30,
            message="Extracting files...",
        )
        file_mapping = extract_import_file_mapping(temp_path, user_id, data)

        if override:
            stage = "clearing"
            await _update_job(
                job_id,
                stage=stage,
                percent=40,
                message="Removing existing data...",
            )

        stage = "importing"
        await _update_job(
            job_id,
            stage=stage,
            percent=50,
            message="Importing data...",
        )

        async with async_session_maker() as db:
            if override:
                await clear_existing_import_data(db, user_id)

            import_result = await import_payload_data(
                db,
                user_id,
                data,
                file_mapping,
                lambda **_: None,
            )

            result_payload = {
                "applications": import_result.get("applications", 0),
                "rounds": import_result.get("rounds", 0),
                "status_history": import_result.get("status_history", 0),
                "files": len(file_mapping),
            }

            stage = "finalizing"
            await update_transfer_job_progress(
                db,
                job_id=job_id,
                stage=stage,
                percent=95,
                message="Finalizing...",
            )
            await log_import_event(
                db,
                user_id,
                "success",
                {
                    "import_id": job_id,
                    "override": override,
                    "filename": filename,
                    "format": "v1.0" if is_new_export_format(data) else "legacy",
                    "applications_imported": result_payload["applications"],
                    "rounds_imported": result_payload["rounds"],
                    "status_history_imported": result_payload["status_history"],
                    "files_imported": result_payload["files"],
                    "zip_file_count": zip_info.get("file_count", 0),
                },
                ip_address=ip_address,
            )
            await complete_transfer_job(
                db,
                job_id=job_id,
                message="Import complete",
                result=result_payload,
            )
    except Exception as exc:
        message = str(exc)
        async with async_session_maker() as db:
            await log_import_event(
                db,
                user_id,
                "failed",
                {
                    "import_id": job_id,
                    "override": override,
                    "filename": filename,
                    "error": message,
                },
                ip_address=ip_address,
            )
        await _fail_job(
            job_id,
            message=f"Import failed: {message}",
            error={"error": message},
            stage=stage,
        )
        logger.exception("Import job %s failed", job_id)
    finally:
        if os.path.exists(temp_path):
            secure_delete(temp_path)


async def schedule_import_processing(
    background_tasks: BackgroundTasks,
    *,
    job_id: str,
    user_id: str,
    temp_path: str,
    override: bool,
    filename: str | None,
    ip_address: str | None,
) -> None:
    background_tasks.add_task(
        process_import_job,
        job_id=job_id,
        user_id=user_id,
        temp_path=temp_path,
        override=override,
        filename=filename,
        ip_address=ip_address,
    )


@router.post("/validate")
@conditional_rate_limit("5/hour")
async def validate_import(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("import:write")),
    db: AsyncSession = Depends(get_db),
):
    """Validate an import ZIP file without importing data."""
    temp_path = None
    user_id = str(user.id)
    try:
        temp_path = create_secure_temp_file(file.filename or "import.zip")

        async with aiofiles.open(temp_path, "wb") as f:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                await f.write(chunk)

        zip_info = await validate_zip_safety(temp_path)

        with zipfile.ZipFile(temp_path, "r") as zip_ref:
            try:
                data_json = zip_ref.read("data.json")
            except KeyError:
                raise HTTPException(
                    status_code=400, detail="ZIP must contain data.json"
                )
            data = json.loads(data_json)

        validation = await validate_import_payload(db, user_id, data, zip_info)

        await log_import_event(
            db,
            user_id,
            "validation_success",
            {
                "filename": file.filename,
                "format": "v1.0" if is_new_export_format(data) else "legacy",
                "applications_count": validation.summary.get("applications", 0),
                "rounds_count": validation.summary.get("rounds", 0),
            },
            request=request,
        )
        return validation
    except HTTPException:
        raise
    except ValueError as exc:
        await log_import_event(
            db,
            user_id,
            "validation_failed",
            {"filename": file.filename, "error": str(exc)},
            request=request,
        )
        return ImportValidationResponse(valid=False, summary={}, errors=[str(exc)])
    except Exception as exc:
        await log_import_event(
            db,
            user_id,
            "validation_failed",
            {"filename": file.filename, "error": str(exc)},
            request=request,
        )
        return ImportValidationResponse(valid=False, summary={}, errors=[str(exc)])
    finally:
        if temp_path and os.path.exists(temp_path):
            secure_delete(temp_path)


@router.get("/progress/{import_id}")
async def import_progress(import_id: str, token: str | None = Query(None)):
    """Server-Sent Events endpoint for import progress."""
    payload = decode_token(token) if token else None
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    requester_id = payload.get("sub")
    if not requester_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    initial_payload = await _get_job_payload(import_id, requester_id)
    if initial_payload is None:
        raise HTTPException(status_code=404, detail="Import not found")

    async def event_stream():
        last_serialized = ""
        for tick in range(SSE_POLL_MAX_SECONDS):
            current_payload = await _get_job_payload(import_id, requester_id)
            if current_payload is None:
                return
            serialized = json.dumps(current_payload, sort_keys=True)
            if serialized != last_serialized:
                yield f"event: progress\ndata: {serialized}\n\n"
                last_serialized = serialized
            if current_payload.get("status") in {"complete", "failed", "cancelled"}:
                return
            if tick % 15 == 14:
                yield ": keepalive\n\n"
            await asyncio.sleep(1)

        timeout_payload = await _get_job_payload(import_id, requester_id)
        if timeout_payload is not None and timeout_payload.get("status") not in {
            "complete",
            "failed",
            "cancelled",
        }:
            yield 'event: timeout\ndata: {"status":"processing"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/status/{import_id}")
async def import_status(
    import_id: str,
    user: User = Depends(get_current_user),
    __: object = Depends(require_api_key_scope("import:write")),
    db: AsyncSession = Depends(get_db),
):
    """JSON status endpoint for CLI and polling clients."""
    job = await get_transfer_job_for_user(db, job_id=import_id, user_id=str(user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Import not found")
    return serialize_transfer_job(job)


@router.post("/import", status_code=status.HTTP_202_ACCEPTED)
@conditional_rate_limit("5/hour")
async def import_data(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile,
    override: bool = Form(False),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("import:write")),
    db: AsyncSession = Depends(get_db),
):
    """Queue an import job from a ZIP file."""
    temp_path = None
    job_id: str | None = None
    user_id = str(user.id)
    try:
        temp_path = create_secure_temp_file(file.filename or "import.zip")
        async with aiofiles.open(temp_path, "wb") as f:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                await f.write(chunk)

        job = await create_transfer_job(
            db,
            user_id=user_id,
            job_type="import_zip",
            status="queued",
            stage="queued",
            percent=0,
            message="Queued for processing",
            source_path=temp_path,
        )
        job_id = str(job.id)

        await log_import_event(
            db,
            user_id,
            "queued",
            {
                "import_id": job_id,
                "override": override,
                "filename": file.filename,
            },
            request=request,
        )

        await schedule_import_processing(
            background_tasks,
            job_id=job_id,
            user_id=user_id,
            temp_path=temp_path,
            override=override,
            filename=file.filename,
            ip_address=request.client.host if request.client else None,
        )

        return {
            "job_id": job_id,
            "import_id": job_id,
            "status": "queued",
        }
    except Exception as exc:
        logger.exception("Failed to queue import for user %s", user_id)
        if temp_path and os.path.exists(temp_path):
            secure_delete(temp_path)
        if job_id is not None:
            try:
                await _fail_job(
                    job_id,
                    message="Import failed before processing started",
                    error={"error": str(exc)},
                    stage="queued",
                )
            except Exception:
                logger.exception("Failed to mark import job %s as failed", job_id)
        raise HTTPException(status_code=500, detail="Import failed") from exc
