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
from datetime import datetime, timedelta

import aiofiles
from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    AuditLog,
    Round,
    RoundMedia,
    RoundType,
    User,
)

import_schemas = importlib.import_module("app.schemas.import")
ImportDataSchema = import_schemas.ImportDataSchema
ImportValidationResponse = import_schemas.ImportValidationResponse
from app.api.utils.zip_utils import validate_zip_safety
from app.services.export_registry import default_registry
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService

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

SECURE_TEMP_DIR = "/tmp/secure_imports"
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
        cutoff = datetime.utcnow() - timedelta(minutes=cls.MAX_AGE_MINUTES)
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
            "created_at": datetime.utcnow().isoformat(),
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
                    "created_at", datetime.utcnow().isoformat()
                ),
            }

    @classmethod
    def delete(cls, import_id: str):
        if import_id in cls._active_imports:
            del cls._active_imports[import_id]


# ============================================================================
# Helper Functions
# ============================================================================

from pathlib import Path


async def ensure_status_exists(
    db: AsyncSession, user_id: str, status_name: str
) -> ApplicationStatus:
    """Ensure a status exists, creating if necessary with defaults."""
    result = await db.execute(
        select(ApplicationStatus)
        .where(
            (ApplicationStatus.user_id == user_id) | (ApplicationStatus.user_id == None)
        )
        .where(ApplicationStatus.name == status_name)
    )
    status = result.scalar_one_or_none()

    if not status:
        # Create with neutral defaults
        status = ApplicationStatus(
            user_id=user_id,
            name=status_name,
            color="#6B7280",  # Neutral gray
            is_default=False,
            order=999,
        )
        db.add(status)
        await db.flush()

    return status


async def ensure_round_type_exists(
    db: AsyncSession, user_id: str, type_name: str
) -> RoundType:
    """Ensure a round type exists, creating if necessary."""
    result = await db.execute(
        select(RoundType)
        .where((RoundType.user_id == user_id) | (RoundType.user_id == None))
        .where(RoundType.name == type_name)
    )
    round_type = result.scalar_one_or_none()

    if not round_type:
        round_type = RoundType(
            user_id=user_id,
            name=type_name,
            is_default=False,
        )
        db.add(round_type)
        await db.flush()

    return round_type


def extract_files_from_zip(zip_path: str, user_id: str) -> dict[str, str]:
    """Extract files from ZIP and return mapping of old paths to new paths."""

    user_upload_dir = Path(UPLOAD_DIR) / str(user_id)
    user_upload_dir.mkdir(parents=True, exist_ok=True)

    file_mapping = {}

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        for file_info in zip_ref.filelist:
            if file_info.filename.startswith("files/") and not file_info.is_dir():
                # Extract to user's upload directory
                filename = Path(file_info.filename).name
                dest_path = user_upload_dir / filename

                # Avoid collisions
                counter = 1
                while dest_path.exists():
                    stem = Path(file_info.filename).stem
                    suffix = Path(file_info.filename).suffix
                    dest_path = user_upload_dir / f"{stem}_{counter}{suffix}"
                    counter += 1

                zip_ref.extract(file_info, str(user_upload_dir))

                # Map old path (from ZIP) to new path
                old_path = file_info.filename
                file_mapping[old_path] = str(dest_path.relative_to(Path(UPLOAD_DIR)))

    return file_mapping


def is_new_export_format(data: dict) -> bool:
    """Check if data uses the new introspective export format."""
    return "export_version" in data and "models" in data


def _run_import_user_data(
    sync_session, export_data: dict, user_id: str, override: bool
) -> dict:
    """Synchronous helper to run the import service."""
    id_mapper = IDMapper()
    import_service = ImportService(registry=default_registry, id_mapper=id_mapper)
    return import_service.import_user_data(
        export_data=export_data,
        user_id=user_id,
        session=sync_session,
        override=override,
    )


async def import_applications(
    db: AsyncSession,
    user_id: str,
    applications_data: list,
    file_mapping: dict,
    progress_callback,
) -> dict:
    """Import applications with all related data."""

    application_count = len(applications_data)
    imported_apps = []
    imported_rounds = 0
    imported_history = 0

    for idx, app_data in enumerate(applications_data):
        # Update progress
        percent = int((idx / application_count) * 100)
        progress_callback(
            stage="importing_applications",
            percent=percent,
            message=f"Importing application {idx + 1}/{application_count}",
        )

        # Get or create status
        status = await ensure_status_exists(db, user_id, app_data.status)

        # Parse dates - applied_at is stored as a date in the model
        applied_at_dt = datetime.fromisoformat(
            app_data.applied_at.replace("Z", "+00:00")
        )
        applied_at = applied_at_dt.date()

        # Create application (generate new ID)
        application = Application(
            user_id=user_id,
            company=app_data.company,
            job_title=app_data.job_title,
            job_description=app_data.job_description,
            job_url=app_data.job_url,
            status_id=status.id,
            cv_path=file_mapping.get(f"files/applications/cv_{app_data.id}.pdf")
            if app_data.cv_path
            else None,
            applied_at=applied_at,
        )
        db.add(application)
        await db.flush()

        imported_apps.append(application)

        # Import status history
        for hist_data in app_data.status_history:
            from_status = (
                await ensure_status_exists(db, user_id, hist_data.from_status)
                if hist_data.from_status
                else None
            )
            to_status = await ensure_status_exists(db, user_id, hist_data.to_status)

            changed_at = datetime.fromisoformat(
                hist_data.changed_at.replace("Z", "+00:00")
            )

            history = ApplicationStatusHistory(
                application_id=application.id,
                from_status_id=from_status.id if from_status else None,
                to_status_id=to_status.id,
                changed_at=changed_at,
                note=hist_data.note,
            )
            db.add(history)
            imported_history += 1

        # Import rounds
        for round_data in app_data.rounds:
            round_type = await ensure_round_type_exists(db, user_id, round_data.type)

            scheduled_at = (
                datetime.fromisoformat(round_data.scheduled_at.replace("Z", "+00:00"))
                if round_data.scheduled_at
                else None
            )
            completed_at = (
                datetime.fromisoformat(round_data.completed_at.replace("Z", "+00:00"))
                if round_data.completed_at
                else None
            )

            round = Round(
                application_id=application.id,
                round_type_id=round_type.id,
                scheduled_at=scheduled_at,
                completed_at=completed_at,
                outcome=round_data.outcome,
                notes_summary=round_data.notes_summary,
            )
            db.add(round)
            await db.flush()
            imported_rounds += 1

            # Import media
            for media_data in round_data.media:
                media_path = file_mapping.get(media_data.path or "")
                if media_path:
                    media = RoundMedia(
                        round_id=round.id,
                        media_type=media_data.type,
                        file_path=media_path,
                    )
                    db.add(media)

    return {
        "applications": len(imported_apps),
        "rounds": imported_rounds,
        "status_history": imported_history,
    }


@router.post("/validate")
@conditional_rate_limit("5/hour")
async def validate_import(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate an import ZIP file without importing data."""

    temp_path = None
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

        # Validate with Pydantic
        validated_data = ImportDataSchema(**data)

        # Log successful validation
        await log_import_event(
            db,
            user.id,
            "validation_success",
            {
                "filename": file.filename,
                "applications_count": len(validated_data.applications),
                "rounds_count": sum(
                    len(app.rounds) for app in validated_data.applications
                ),
            },
            request,
        )

        # Check for override warning
        result = await db.execute(
            select(Application).where(Application.user_id == user.id)
        )
        existing_count = len(result.scalars().all())

        warnings = []
        if existing_count > 0:
            warnings.append(
                f"You have {existing_count} existing applications. Import will add to these unless you choose to override."
            )

        # Check for missing statuses/round types
        existing_statuses = await db.execute(
            select(ApplicationStatus.name).where(
                (ApplicationStatus.user_id == user.id)
                | (ApplicationStatus.user_id == None)
            )
        )
        existing_status_names = {s[0] for s in existing_statuses.all()}

        needed_statuses = set()
        for app in validated_data.applications:
            needed_statuses.add(app.status)
            for hist in app.status_history:
                if hist.to_status:
                    needed_statuses.add(hist.to_status)
                if hist.from_status:
                    needed_statuses.add(hist.from_status)

        missing_statuses = needed_statuses - existing_status_names
        if missing_statuses:
            status_list = list(missing_statuses)[:5]
            status_str = ", ".join(status_list)
            if len(missing_statuses) > 5:
                status_str += "..."
            warnings.append(
                f"Will create {len(missing_statuses)} new statuses: {status_str}"
            )

        return ImportValidationResponse(
            valid=True,
            summary={
                "applications": len(validated_data.applications),
                "rounds": sum(len(app.rounds) for app in validated_data.applications),
                "status_history": sum(
                    len(app.status_history) for app in validated_data.applications
                ),
                "custom_statuses": len(validated_data.custom_statuses),
                "custom_round_types": len(validated_data.custom_round_types),
                "files": zip_info["file_count"] - 1,  # -1 for data.json
            },
            warnings=warnings,
        )

    except HTTPException:
        raise
    except Exception as e:
        # Log validation failure
        await log_import_event(
            db,
            user.id,
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

        _zip_info = await validate_zip_safety(temp_path)

        with zipfile.ZipFile(temp_path, "r") as zip_ref:
            data_json = zip_ref.read("data.json")
            data = json.loads(data_json)

        # Stage 3: Extract files
        ImportProgress.update(
            import_id, stage="extracting", percent=30, message="Extracting files..."
        )

        file_mapping = extract_files_from_zip(temp_path, str(user.id))

        # Stage 4: Override if requested
        if override:
            ImportProgress.update(
                import_id,
                stage="clearing",
                percent=40,
                message="Removing existing data...",
            )

            # Delete existing applications (cascade will handle related data)
            result = await db.execute(
                select(Application).where(Application.user_id == user.id)
            )
            for app in result.scalars().all():
                await db.delete(app)

            await db.flush()

        # Stage 5: Import data
        ImportProgress.update(
            import_id, stage="importing", percent=50, message="Importing data..."
        )

        # Check if this is the new format or legacy format
        if is_new_export_format(data):
            # Use the new ImportService for v1.0 exports
            result = await db.run_sync(
                _run_import_user_data, data, str(user.id), override
            )

            # Map result keys to expected format
            import_result = {
                "applications": result.get("Application", 0),
                "rounds": result.get("Round", 0),
                "status_history": result.get("ApplicationStatusHistory", 0),
                "statuses": result.get("ApplicationStatus", 0),
                "round_types": result.get("RoundType", 0),
                "media": result.get("RoundMedia", 0),
            }
        else:
            # Legacy format - use the old import logic
            validated_data = ImportDataSchema(**data)

            # Import custom statuses
            for status_data in validated_data.custom_statuses:
                existing = await db.execute(
                    select(ApplicationStatus)
                    .where(ApplicationStatus.user_id == user.id)
                    .where(ApplicationStatus.name == status_data.name)
                )
                if not existing.scalar_one_or_none():
                    status = ApplicationStatus(
                        user_id=user.id,
                        name=status_data.name,
                        color=status_data.color or "#6B7280",
                        is_default=status_data.is_default,
                        order=status_data.order or 999,
                    )
                    db.add(status)

            await db.flush()

            # Import custom round types
            for type_data in validated_data.custom_round_types:
                existing = await db.execute(
                    select(RoundType)
                    .where(RoundType.user_id == user.id)
                    .where(RoundType.name == type_data.name)
                )
                if not existing.scalar_one_or_none():
                    round_type = RoundType(
                        user_id=user.id,
                        name=type_data.name,
                        is_default=type_data.is_default,
                    )
                    db.add(round_type)

            await db.flush()

            # Import applications with progress callback
            def progress_update(**kwargs):
                percent = 50 + int(kwargs.pop("percent", 0) * 0.4)  # 50-90%
                ImportProgress.update(import_id, percent=percent, **kwargs)

            import_result = await import_applications(
                db,
                str(user.id),
                validated_data.applications,
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
            user.id,
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
            user.id,
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
    except Exception as e:
        await db.rollback()
        # Log import failure
        await log_import_event(
            db,
            user.id,
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
