import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload

from app.api.utils.zip_utils import create_zip_export
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, ApplicationStatusHistory, Round, User
from app.services.export_registry import default_registry
from app.services.export_service import ExportService

router = APIRouter(prefix="/api/export", tags=["export"])


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
    return export_service.export_user_data(
        user_id=user_id, session=sync_session, include_media_paths=True
    )


@router.get("/json")
async def export_json(
    user: User = Depends(get_current_user),
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
        # Determine if we have rounds and/or status history
        has_rounds = bool(app.rounds)
        has_status_history = bool(app.status_history)

        # Prepare status history data for this application
        status_history_entries = []
        for h in app.status_history:
            from_status = h.from_status.name if h.from_status else "None"
            to_status = h.to_status.name if h.to_status else "Unknown"
            status_history_entries.append(
                {
                    "from_to": f"{from_status} -> {to_status}",
                    "changed_at": str(h.changed_at),
                    "note": h.note or "",
                }
            )

        if not has_rounds and not has_status_history:
            # Write a row for the application with no rounds and no status history
            writer.writerow(
                [
                    _sanitize_csv_value(app.company),
                    _sanitize_csv_value(app.job_title),
                    _sanitize_csv_value(app.status.name),
                    str(app.applied_at),
                    _sanitize_csv_value(app.job_url),
                    _sanitize_csv_value(app.cv_path),
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                ]
            )
        elif not has_rounds and has_status_history:
            # Write rows for status history entries without rounds
            for entry in status_history_entries:
                writer.writerow(
                    [
                        _sanitize_csv_value(app.company),
                        _sanitize_csv_value(app.job_title),
                        _sanitize_csv_value(app.status.name),
                        str(app.applied_at),
                        _sanitize_csv_value(app.job_url),
                        _sanitize_csv_value(app.cv_path),
                        _sanitize_csv_value(entry["from_to"]),
                        entry["changed_at"],
                        _sanitize_csv_value(entry["note"]),
                        "",
                        "",
                        "",
                        "",
                    ]
                )
        else:
            # We have rounds - write a row for each round
            for round in app.rounds:
                # Build media info string
                media_info = (
                    "; ".join([f"{m.media_type}:{m.file_path}" for m in round.media])
                    if round.media
                    else ""
                )

                # Determine round status
                round_status = (
                    "Completed"
                    if round.completed_at
                    else "Scheduled"
                    if round.scheduled_at
                    else "Pending"
                )

                # Include status history info on first round row only
                if has_status_history and round == app.rounds[0]:
                    # Write a row for each status history entry with the first round
                    for i, entry in enumerate(status_history_entries):
                        is_first_status_entry = i == 0
                        writer.writerow(
                            [
                                _sanitize_csv_value(app.company),
                                _sanitize_csv_value(app.job_title),
                                _sanitize_csv_value(app.status.name),
                                str(app.applied_at),
                                _sanitize_csv_value(app.job_url),
                                _sanitize_csv_value(app.cv_path),
                                _sanitize_csv_value(entry["from_to"]),
                                entry["changed_at"],
                                _sanitize_csv_value(entry["note"]),
                                _sanitize_csv_value(
                                    round.round_type.name if round.round_type else None
                                )
                                if is_first_status_entry
                                else "",
                                round_status if is_first_status_entry else "",
                                _sanitize_csv_value(round.outcome)
                                if is_first_status_entry
                                else "",
                                _sanitize_csv_value(round.notes_summary)
                                if is_first_status_entry
                                else "",
                                _sanitize_csv_value(media_info)
                                if is_first_status_entry
                                else "",
                            ]
                        )
                elif not has_status_history:
                    # No status history, just write round row
                    writer.writerow(
                        [
                            _sanitize_csv_value(app.company),
                            _sanitize_csv_value(app.job_title),
                            _sanitize_csv_value(app.status.name),
                            str(app.applied_at),
                            _sanitize_csv_value(app.job_url),
                            _sanitize_csv_value(app.cv_path),
                            "",
                            "",
                            "",
                            _sanitize_csv_value(
                                round.round_type.name if round.round_type else None
                            ),
                            round_status,
                            _sanitize_csv_value(round.outcome),
                            _sanitize_csv_value(round.notes_summary),
                            _sanitize_csv_value(media_info),
                        ]
                    )
                else:
                    # Additional rounds without status history (already written above)
                    writer.writerow(
                        [
                            _sanitize_csv_value(app.company),
                            _sanitize_csv_value(app.job_title),
                            _sanitize_csv_value(app.status.name),
                            str(app.applied_at),
                            _sanitize_csv_value(app.job_url),
                            _sanitize_csv_value(app.cv_path),
                            "",
                            "",
                            "",
                            _sanitize_csv_value(
                                round.round_type.name if round.round_type else None
                            ),
                            round_status,
                            _sanitize_csv_value(round.outcome),
                            _sanitize_csv_value(round.notes_summary),
                            _sanitize_csv_value(media_info),
                        ]
                    )

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tarnished-export.csv"},
    )


@router.get("/zip")
async def export_zip(
    user: User = Depends(get_current_user),
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

    # Create ZIP with all media files
    zip_bytes = await create_zip_export(
        json_data, str(user.id), settings.upload_dir, user_email=user.email
    )

    filename = f"tarnished-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
