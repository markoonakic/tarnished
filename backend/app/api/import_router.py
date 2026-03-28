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
from datetime import UTC, datetime, timedelta

import aiofiles
from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.models import (
    AuditLog,
    User,
)

import_schemas = importlib.import_module("app.schemas.import")
ImportValidationResponse = import_schemas.ImportValidationResponse
from app.api.utils.zip_utils import validate_zip_safety
from app.services.import_execution import (
    clear_existing_import_data,
    extract_import_file_mapping,
    import_payload_data,
    verify_new_format_manifest_checksum,
)
from app.services.import_validation import is_new_export_format, validate_import_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/import", tags=["import"])


def conditional_rate_limit(limit_string: str):
    """Apply rate limiting only when enabled."""

    def decorator(func: Callable):
        # Check if rate limiting is disabled
        if os.environ.get("ENABLE_RATE_LIMITING", "true").lower() == "false":
            return func

        # Otherwise apply the rate limit decorator
        return limiter.limit(limit_string)(func)

    return decorator


async def log_import_event(
    db: AsyncSession, user_id: str, event: str, details: dict, request: Request
):
    """Log import events for security audit."""
    log = AuditLog(
        user_id=user_id,
        event_type=f"import_{event}",
        details=json.dumps(details),
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    await db.commit()


UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1MB
SSE_POLL_MAX_SECONDS = 300  # 5 minutes

SECURE_TEMP_DIR = "/tmp/secure_imports"  # nosec B108 # Intentional secure dir with mode 0o700
os.makedirs(SECURE_TEMP_DIR, mode=0o700, exist_ok=True)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")


def create_secure_temp_file(original_filename: str) -> str:
    """Create secure temp file with proper permissions."""
    safe_filename = f"{uuid.uuid4()}_{original_filename}"
    temp_path = os.path.join(SECURE_TEMP_DIR, safe_filename)
    fd = os.open(temp_path, os.O_WRONLY | os.O_CREAT, 0o600)
    os.close(fd)
    return temp_path


def secure_delete(file_path: str):
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


class ImportProgress:
    """Track import progress for SSE streaming."""

    _active_imports: dict[str, dict] = {}
    MAX_AGE_MINUTES = 5

    @classmethod
    def _cleanup_old_entries(cls):
        """Remove entries older than MAX_AGE_MINUTES to prevent memory leaks."""
        cutoff = datetime.now(UTC) - timedelta(minutes=cls.MAX_AGE_MINUTES)
        to_delete = [
            import_id
            for import_id, data in cls._active_imports.items()
            if datetime.fromisoformat(data.get("created_at", "2000-01-01")) < cutoff
        ]
        for import_id in to_delete:
            del cls._active_imports[import_id]

    @classmethod
    def get_progress(cls, import_id: str) -> dict:
        return cls._active_imports.get(import_id, {"status": "unknown"})

    @classmethod
    def create(cls, import_id: str) -> dict:
        # Clean up old entries first
        cls._cleanup_old_entries()

        progress = {
            "status": "pending",
            "stage": "initializing",
            "percent": 0,
            "message": "Starting import...",
            "created_at": datetime.now(UTC).isoformat(),
        }
        cls._active_imports[import_id] = progress
        return progress

    @classmethod
    def update(cls, import_id: str, **updates):
        if import_id in cls._active_imports:
            cls._active_imports[import_id].update(updates)

    @classmethod
    def complete(cls, import_id: str, success: bool, result: dict | None = None):
        if import_id in cls._active_imports:
            cls._active_imports[import_id] = {
                "status": "complete",
                "success": success,
                "result": result or {},
                "created_at": cls._active_imports[import_id].get(
                    "created_at", datetime.now(UTC).isoformat()
                ),
            }

    @classmethod
    def delete(cls, import_id: str):
        if import_id in cls._active_imports:
            del cls._active_imports[import_id]


@router.post("/validate")
@conditional_rate_limit("5/hour")
async def validate_import(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate an import ZIP file without importing data.

    Supports both the new introspective export format (v1.0) and the
    legacy format for backward compatibility.
    """

    temp_path = None
    user_id = str(user.id)
    try:
        # Stream upload to disk
        temp_path = create_secure_temp_file(file.filename or "import.zip")

        async with aiofiles.open(temp_path, "wb") as f:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                await f.write(chunk)

        # Validate ZIP safety
        zip_info = await validate_zip_safety(temp_path)

        # Extract and validate data.json
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
            request,
        )

        return validation

    except HTTPException:
        raise
    except ValueError as e:
        await log_import_event(
            db,
            user_id,
            "validation_failed",
            {
                "filename": file.filename,
                "error": str(e),
            },
            request,
        )
        return ImportValidationResponse(valid=False, summary={}, errors=[str(e)])
    except Exception as e:
        # Log validation failure
        await log_import_event(
            db,
            user_id,
            "validation_failed",
            {
                "filename": file.filename,
                "error": str(e),
            },
            request,
        )
        return ImportValidationResponse(valid=False, summary={}, errors=[str(e)])
    finally:
        if temp_path and os.path.exists(temp_path):
            secure_delete(temp_path)


@router.get("/progress/{import_id}")
async def import_progress(import_id: str):
    """Server-Sent Events endpoint for import progress."""

    async def event_stream():
        progress = ImportProgress.get_progress(import_id)

        # Send current state
        yield f"event: progress\ndata: {json.dumps(progress)}\n\n"

        if progress.get("status") == "complete":
            return

        # Poll for updates
        last_status = progress.get("status")
        for _ in range(SSE_POLL_MAX_SECONDS):
            await asyncio.sleep(1)
            progress = ImportProgress.get_progress(import_id)

            if progress.get("status") != last_status:
                yield f"event: progress\ndata: {json.dumps(progress)}\n\n"
                last_status = progress.get("status")

                if progress.get("status") == "complete":
                    ImportProgress.delete(import_id)
                    return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/status/{import_id}")
async def import_status(import_id: str):
    """JSON status endpoint for CLI and polling clients."""
    return ImportProgress.get_progress(import_id)


@router.post("/import")
@conditional_rate_limit("5/hour")
async def import_data(
    request: Request,
    file: UploadFile,
    override: bool = Form(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import data from a ZIP file.

    Supports both the new introspective export format (v1.0) and the
    legacy format for backward compatibility.
    """

    import_id = str(uuid.uuid4())
    temp_path = None
    user_id = str(user.id)

    try:
        # Initialize progress
        ImportProgress.create(import_id)

        # Stage 1: Upload
        ImportProgress.update(
            import_id, stage="uploading", percent=10, message="Uploading file..."
        )

        temp_path = create_secure_temp_file(file.filename or "import.zip")

        async with aiofiles.open(temp_path, "wb") as f:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                await f.write(chunk)

        # Stage 2: Validate
        ImportProgress.update(
            import_id, stage="validating", percent=20, message="Validating ZIP file..."
        )

        await validate_zip_safety(temp_path)

        with zipfile.ZipFile(temp_path, "r") as zip_ref:
            data_json = zip_ref.read("data.json")
            data = json.loads(data_json)
            verify_new_format_manifest_checksum(data, data_json, zip_ref)

        # Stage 3: Extract files
        ImportProgress.update(
            import_id, stage="extracting", percent=30, message="Extracting files..."
        )

        # Detect format and use appropriate extraction method
        file_mapping = extract_import_file_mapping(temp_path, user_id, data)

        # Stage 4: Override if requested
        if override:
            ImportProgress.update(
                import_id,
                stage="clearing",
                percent=40,
                message="Removing existing data...",
            )

            await clear_existing_import_data(db, user_id)

        # Stage 5: Import data
        ImportProgress.update(
            import_id, stage="importing", percent=50, message="Importing data..."
        )

        def progress_update(**kwargs):
            percent = 50 + int(kwargs.pop("percent", 0) * 0.4)
            ImportProgress.update(import_id, percent=percent, **kwargs)

        import_result = await import_payload_data(
            db,
            user_id,
            data,
            file_mapping,
            progress_update,
        )

        # Stage 6: Complete
        ImportProgress.update(
            import_id, stage="finalizing", percent=95, message="Finalizing..."
        )

        await db.commit()

        # Log successful import
        await log_import_event(
            db,
            user_id,
            "success",
            {
                "import_id": import_id,
                "override": override,
                "format": "v1.0" if is_new_export_format(data) else "legacy",
                "applications_imported": import_result.get("applications", 0),
                "rounds_imported": import_result.get("rounds", 0),
                "status_history_imported": import_result.get("status_history", 0),
                "files_imported": len(file_mapping),
            },
            request,
        )

        ImportProgress.complete(
            import_id,
            success=True,
            result={
                "applications": import_result.get("applications", 0),
                "rounds": import_result.get("rounds", 0),
                "status_history": import_result.get("status_history", 0),
                "files": len(file_mapping),
            },
        )

        return {"import_id": import_id, "status": "processing"}

    except HTTPException:
        # Log HTTP exception
        await log_import_event(
            db,
            user_id,
            "failed",
            {
                "import_id": import_id,
                "override": override,
                "error": "Validation failed",
            },
            request,
        )
        ImportProgress.complete(
            import_id, success=False, result={"error": "Validation failed"}
        )
        raise
    except ValueError as e:
        await db.rollback()
        await log_import_event(
            db,
            user_id,
            "failed",
            {
                "import_id": import_id,
                "override": override,
                "error": str(e),
            },
            request,
        )
        ImportProgress.complete(import_id, success=False, result={"error": str(e)})
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")
    except Exception as e:
        await db.rollback()
        # Log import failure
        await log_import_event(
            db,
            user_id,
            "failed",
            {
                "import_id": import_id,
                "override": override,
                "error": str(e),
            },
            request,
        )
        ImportProgress.complete(import_id, success=False, result={"error": str(e)})
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            secure_delete(temp_path)
