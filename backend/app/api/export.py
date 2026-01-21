import csv
import io
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, Round, User

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/json")
async def export_json(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application)
        .where(Application.user_id == user.id)
        .options(
            selectinload(Application.status),
            selectinload(Application.rounds).selectinload(Round.round_type),
            selectinload(Application.rounds).selectinload(Round.media),
        )
    )
    applications = result.scalars().all()

    data = {
        "user": {"id": user.id, "email": user.email},
        "applications": [
            {
                "id": app.id,
                "company": app.company,
                "job_title": app.job_title,
                "job_description": app.job_description,
                "job_url": app.job_url,
                "status": app.status.name,
                "cv_path": app.cv_path,
                "applied_at": str(app.applied_at),
                "rounds": [
                    {
                        "id": r.id,
                        "type": r.round_type.name,
                        "scheduled_at": str(r.scheduled_at) if r.scheduled_at else None,
                        "completed_at": str(r.completed_at) if r.completed_at else None,
                        "outcome": r.outcome,
                        "notes_summary": r.notes_summary,
                        "media": [
                            {"type": m.media_type, "path": m.file_path}
                            for m in r.media
                        ],
                    }
                    for r in app.rounds
                ],
            }
            for app in applications
        ],
    }

    return StreamingResponse(
        io.BytesIO(json.dumps(data, indent=2).encode()),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=job-tracker-export.json"},
    )


@router.get("/csv")
async def export_csv(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application)
        .where(Application.user_id == user.id)
        .options(selectinload(Application.status))
        .order_by(Application.applied_at.desc())
    )
    applications = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Company",
        "Job Title",
        "Status",
        "Applied Date",
        "Job URL",
        "CV Path",
    ])

    for app in applications:
        writer.writerow([
            app.company,
            app.job_title,
            app.status.name,
            str(app.applied_at),
            app.job_url or "",
            app.cv_path or "",
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=job-tracker-export.csv"},
    )
