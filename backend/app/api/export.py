import csv
import io
import json
import os
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload
from starlette.background import BackgroundTask

from app.api.utils.zip_utils import create_zip_export_file
from app.core.config import get_settings
from app.core.database import async_session_maker, get_db
from app.core.deps import (
    get_current_user,
    require_api_key_scope,
    require_api_key_scopes,
)
from app.models import Application, ApplicationStatusHistory, Round, User
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.transfer_jobs import (
    complete_transfer_job,
    create_transfer_job,
    fail_transfer_job,
    get_transfer_job_for_user,
    serialize_transfer_job,
    update_transfer_job_progress,
)

router = APIRouter(prefix="/api/export", tags=["export"])


def _delete_temp_file(path: str) -> None:
    if os.path.exists(path):
        os.unlink(path)


def _sanitize_csv_value(value: str | None) -> str:
    """Prevent CSV injection by escaping formula characters.

    If a value starts with =, -, +, or @, Excel may interpret it as a formula.
    Prefix with a tab to prevent this while maintaining readability.
    """
    if value and isinstance(value, str) and value[0] in ("=", "-", "+", "@"):
        return f"\t{value}"
    return value or ""


def _run_export_user_data(sync_session: Session, user_id: str) -> dict:
    """Synchronous helper to run the export service."""
    export_service = ExportService(registry=default_registry)
    return export_service.export_user_data(user_id=user_id, session=sync_session)


async def process_export_zip_job(*, job_id: str, user_id: str, user_email: str) -> None:
    try:
        async with async_session_maker() as db:
            await update_transfer_job_progress(
                db,
                job_id=job_id,
                status="processing",
                stage="exporting",
                percent=20,
                message="Collecting export data...",
            )
            data = await db.run_sync(_run_export_user_data, user_id)
            data["user"]["email"] = user_email
            json_data = json.dumps(data, indent=2)

            await update_transfer_job_progress(
                db,
                job_id=job_id,
                stage="archiving",
                percent=70,
                message="Preparing ZIP archive...",
            )

            settings = get_settings()
            zip_path = await create_zip_export_file(
                json_data,
                user_id,
                settings.upload_dir,
                user_email=user_email,
            )

            filename = (
                f"tarnished-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
            )
            await complete_transfer_job(
                db,
                job_id=job_id,
                message="Export ready",
                artifact_path=zip_path,
                result={"filename": filename},
            )
    except Exception as exc:
        async with async_session_maker() as db:
            await fail_transfer_job(
                db,
                job_id=job_id,
                stage="archiving",
                message=f"Export failed: {exc}",
                error={"error": str(exc)},
            )
        raise


@router.post("/zip-jobs", status_code=status.HTTP_202_ACCEPTED)
async def start_export_zip_job(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    _: object = Depends(
        require_api_key_scopes("export:read", "files:read", "profile:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    job = await create_transfer_job(
        db,
        user_id=str(user.id),
        job_type="export_zip",
        status="queued",
        stage="queued",
        percent=0,
        message="Queued for export",
    )
    background_tasks.add_task(
        process_export_zip_job,
        job_id=str(job.id),
        user_id=str(user.id),
        user_email=user.email,
    )
    return {"job_id": str(job.id), "status": "queued"}


@router.get("/zip-jobs/{job_id}")
async def get_export_zip_job(
    job_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(
        require_api_key_scopes("export:read", "files:read", "profile:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    job = await get_transfer_job_for_user(db, job_id=job_id, user_id=str(user.id))
    if job is None or job.job_type != "export_zip":
        raise HTTPException(status_code=404, detail="Export job not found")
    return serialize_transfer_job(job)


@router.get("/zip-jobs/{job_id}/download")
async def download_export_zip_job(
    job_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(
        require_api_key_scopes("export:read", "files:read", "profile:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    job = await get_transfer_job_for_user(db, job_id=job_id, user_id=str(user.id))
    if job is None or job.job_type != "export_zip":
        raise HTTPException(status_code=404, detail="Export job not found")
    if job.status != "complete" or not job.artifact_path:
        raise HTTPException(status_code=409, detail="Export job not ready")
    if not os.path.exists(job.artifact_path):
        raise HTTPException(
            status_code=410,
            detail="Export file is no longer available. Please generate a new export.",
        )
    filename = (job.result or {}).get("filename") or f"export-{job_id}.zip"
    return FileResponse(
        path=job.artifact_path,
        filename=filename,
        media_type="application/zip",
    )


@router.get("/json")
async def export_json(
    user: User = Depends(get_current_user),
    _: object = Depends(
        require_api_key_scopes("export:read", "files:read", "profile:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Export all user data as JSON using the introspective export service."""
    # Run the synchronous export service in an async context
    data = await db.run_sync(_run_export_user_data, str(user.id))

    # Add email to user data (not included by default for privacy)
    data["user"]["email"] = user.email

    return StreamingResponse(
        io.BytesIO(json.dumps(data, indent=2).encode()),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=tarnished-export.json"},
    )


@router.get("/csv")
async def export_csv(
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("export:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application)
        .where(Application.user_id == user.id)
        .options(
            selectinload(Application.status),
            selectinload(Application.status_history).selectinload(
                ApplicationStatusHistory.from_status
            ),
            selectinload(Application.status_history).selectinload(
                ApplicationStatusHistory.to_status
            ),
            selectinload(Application.rounds).selectinload(Round.round_type),
            selectinload(Application.rounds).selectinload(Round.media),
        )
        .order_by(Application.applied_at.desc())
    )
    applications = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(
        [
            "Company",
            "Job Title",
            "Status",
            "Applied Date",
            "Job URL",
            "CV Path",
            "Status History (From -> To)",
            "Status Changed At",
            "Status Change Note",
            "Round Type",
            "Round Status",
            "Round Outcome",
            "Round Notes",
            "Round Media",
        ]
    )

    for app in applications:
        base = [
            app.company,
            app.job_title,
            app.status.name,
            str(app.applied_at),
            app.job_url,
            app.cv_path,
        ]
        history_rows = []
        for entry in app.status_history:
            from_status = entry.from_status.name if entry.from_status else "None"
            to_status = entry.to_status.name if entry.to_status else "Unknown"
            history_rows.append(
                [
                    "Evidence gap" if entry.is_gap else f"{from_status} -> {to_status}",
                    str(entry.changed_at),
                    entry.note,
                ]
            )
        round_rows = [
            [
                round.round_type.name if round.round_type else None,
                "Completed"
                if round.completed_at
                else "Scheduled"
                if round.scheduled_at
                else "Pending",
                round.outcome,
                round.notes_summary,
                "; ".join(
                    f"{media.media_type}:{media.file_path}" for media in round.media
                ),
            ]
            for round in app.rounds
        ]
        # Show each history entry and each round once, sharing the first row.
        for index, history in enumerate(history_rows or [[""] * 3]):
            round_values = round_rows[0] if index == 0 and round_rows else [""] * 5
            writer.writerow(map(_sanitize_csv_value, base + history + round_values))
        for round_values in round_rows[1:]:
            writer.writerow(map(_sanitize_csv_value, base + [""] * 3 + round_values))

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tarnished-export.csv"},
    )


@router.get("/zip")
async def export_zip(
    user: User = Depends(get_current_user),
    _: object = Depends(
        require_api_key_scopes("export:read", "files:read", "profile:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Export all data as a ZIP file containing JSON and media files."""
    # Run the synchronous export service in an async context
    data = await db.run_sync(_run_export_user_data, str(user.id))

    # Add email to user data (not included by default for privacy)
    data["user"]["email"] = user.email

    json_data = json.dumps(data, indent=2)

    # Get upload directory from settings
    settings = get_settings()

    # Create ZIP with all media files on disk so FileResponse can stream it.
    try:
        zip_path = await create_zip_export_file(
            json_data, str(user.id), settings.upload_dir, user_email=user.email
        )
    except (OSError, ValueError):
        raise HTTPException(
            409,
            "Archive could not be completed because an attached file is missing, changed or storage is unavailable. Restore or explicitly remove the unavailable attachment and retry",
        ) from None

    filename = f"tarnished-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return FileResponse(
        path=zip_path,
        filename=filename,
        media_type="application/zip",
        background=BackgroundTask(_delete_temp_file, zip_path),
    )
