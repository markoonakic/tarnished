from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_api_key_scope
from app.models import Application, ApplicationStatusHistory, User
from app.schemas import ApplicationStatusHistoryResponse
from app.schemas.application import StatusResponse
from app.schemas.evidence import (
    CurrentMeaningCorrection,
    HistoryCorrection,
    HistoryEvidence,
)
from app.services.application_evidence import (
    compare_and_set_application,
    erase_history_content,
)
from app.services.interview_jobs import invalidate_interviews

router = APIRouter(prefix="/api/applications", tags=["application-history"])


@router.get(
    "/{application_id}/history", response_model=list[ApplicationStatusHistoryResponse]
)
async def get_application_history(
    application_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("applications:read")),
    db: AsyncSession = Depends(get_db),
):
    # Verify application belongs to user
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # Get history with status details
    result = await db.execute(
        select(ApplicationStatusHistory)
        .where(ApplicationStatusHistory.application_id == application_id)
        .options(
            selectinload(ApplicationStatusHistory.from_status),
            selectinload(ApplicationStatusHistory.to_status),
        )
        .order_by(ApplicationStatusHistory.changed_at.desc())
    )
    history_entries = result.scalars().all()

    # Convert to response format
    response_data = []
    for entry in history_entries:
        response_data.append(
            {
                "id": entry.id,
                "from_status": StatusResponse.model_validate(entry.from_status)
                if entry.from_status and not entry.is_gap
                else None,
                "to_status": StatusResponse.model_validate(entry.to_status)
                if entry.to_status and not entry.is_gap
                else None,
                **HistoryEvidence.model_validate(
                    entry, from_attributes=True
                ).model_dump(),
                "changed_at": entry.changed_at,
                "note": entry.note,
                "reason": entry.reason,
            }
        )

    return response_data


@router.delete(
    "/{application_id}/history/{history_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_history_entry(
    application_id: str,
    history_id: str,
    expected_revision: int | None = Query(None, ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("applications:write")),
    db: AsyncSession = Depends(get_db),
):
    # Verify application belongs to user
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # Find history entry
    result = await db.execute(
        select(ApplicationStatusHistory).where(
            ApplicationStatusHistory.id == history_id,
            ApplicationStatusHistory.application_id == application_id,
        )
    )
    history_entry = result.scalars().first()

    if not history_entry:
        raise HTTPException(status_code=404, detail="History entry not found")

    try:
        await compare_and_set_application(db, application, {}, expected_revision)
        await invalidate_interviews(db, application_id=application_id, removed=True)
        erase_history_content(history_entry)
        await db.commit()
        await db.refresh(application)
    except BaseException:
        await db.rollback()
        raise


@router.patch("/{application_id}/history/{history_id}")
async def correct_history_entry(
    application_id: str,
    history_id: str,
    data: HistoryCorrection,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("applications:write")),
    db: AsyncSession = Depends(get_db),
):
    application = await db.scalar(
        select(Application).where(
            Application.id == application_id,
            Application.user_id == user.id,
        )
    )
    if application is None:
        raise HTTPException(404, "Application not found")
    entries = (
        await db.scalars(
            select(ApplicationStatusHistory)
            .where(
                ApplicationStatusHistory.application_id == application_id,
            )
            .order_by(ApplicationStatusHistory.changed_at, ApplicationStatusHistory.id)
        )
    ).all()
    entry = next((row for row in entries if row.id == history_id), None)
    if entry is None:
        raise HTTPException(404, "History entry not found")
    if entry.is_gap:
        raise HTTPException(409, "Deleted history cannot be corrected")
    if data.from_meaning is not None and entry.from_status_id is None:
        raise HTTPException(422, "Initial event has no source meaning")
    if data.changed_at is not None:
        index = entries.index(entry)

        def utc(value):
            return (
                value.replace(tzinfo=UTC)
                if value.tzinfo is None
                else value.astimezone(UTC)
            )

        if (index > 0 and data.changed_at <= utc(entries[index - 1].changed_at)) or (
            index + 1 < len(entries)
            and data.changed_at >= utc(entries[index + 1].changed_at)
        ):
            raise HTTPException(
                422, "Correction must remain strictly between neighbouring boundaries"
            )
    try:
        await compare_and_set_application(db, application, {}, data.expected_revision)
        for field in ("from_meaning", "to_meaning", "changed_at"):
            if field in data.model_fields_set:
                setattr(entry, field, getattr(data, field))
                provenance = (
                    "time_provenance"
                    if field == "changed_at"
                    else field + "_provenance"
                )
                setattr(entry, provenance, "recorded")
        entry.corrected_at = datetime.now(UTC)
        if "correction_note" in data.model_fields_set:
            if entry.correction_note and entry.correction_note != data.correction_note:
                await invalidate_interviews(
                    db, application_id=application_id, removed=True
                )
            entry.correction_note = data.correction_note
        await db.commit()
        await db.refresh(application)
    except BaseException:
        await db.rollback()
        raise
    return {"id": history_id, "evidence_revision": data.expected_revision + 1}


@router.patch("/{application_id}/meaning")
async def correct_current_meaning(
    application_id: str,
    data: CurrentMeaningCorrection,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("applications:write")),
    db: AsyncSession = Depends(get_db),
):
    application = await db.scalar(
        select(Application).where(
            Application.id == application_id,
            Application.user_id == user.id,
        )
    )
    if application is None:
        raise HTTPException(404, "Application not found")
    try:
        await compare_and_set_application(
            db,
            application,
            {
                "status_meaning": data.meaning,
                "status_meaning_provenance": "recorded",
            },
            data.expected_revision,
        )
        # A current-only correction supplies no historical entry time. Even if a
        # later correction matches an old endpoint, that unknown interval stays a gap.
        db.add(ApplicationStatusHistory(application_id=application.id, is_gap=True))
        await db.commit()
        await db.refresh(application)
    except BaseException:
        await db.rollback()
        raise
    return {"evidence_revision": data.expected_revision + 1}
