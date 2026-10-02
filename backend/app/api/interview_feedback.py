"""Explicit request/status/rerun/read for interview, application and pipeline scopes, plus persisted current document fallback."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.transcriptions import require_executor
from app.api.utils.transcript_route import TranscriptBodyLimitRoute
from app.core.database import get_db
from app.core.deps import (
    AuthContext,
    get_request_time_zone,
    require_api_key_scopes,
)
from app.models import Application
from app.schemas.interview_feedback import (
    DocumentTextPaste,
    InterviewRequest,
    PipelineReportRequest,
    ScopedReportRequest,
)
from app.services.ai_settings import lock_ai_settings
from app.services.interview_jobs import (
    READ_SCOPES,
    SCOPES,
    authority,
    invalidate_reports,
    read,
    read_application,
    read_pipeline,
    start,
    status,
)

router = APIRouter(tags=["interview-feedback"], route_class=TranscriptBodyLimitRoute)


@router.get("/api/rounds/{round_id}/interview-feedback")
async def read_interview_feedback(
    round_id: str,
    auth: AuthContext = Depends(require_api_key_scopes(*READ_SCOPES)),
    db: AsyncSession = Depends(get_db),
):
    value = await read(db, auth, round_id)
    await db.commit()
    return value


@router.post("/api/rounds/{round_id}/interview-feedback", status_code=202)
async def request_interview_feedback(
    round_id: str,
    data: InterviewRequest,
    request: Request,
    auth: AuthContext = Depends(require_api_key_scopes(*SCOPES)),
    db: AsyncSession = Depends(get_db),
):
    require_executor(request)
    job = await start(db, auth, "INTERVIEW", data, round_id=round_id)
    await db.commit()
    return status(job)


@router.get("/api/applications/{application_id}/feedback")
async def read_application_feedback(
    application_id: str,
    auth: AuthContext = Depends(require_api_key_scopes(*READ_SCOPES)),
    db: AsyncSession = Depends(get_db),
):
    value = await read_application(db, auth, application_id)
    await db.commit()
    return value


@router.post("/api/applications/{application_id}/feedback", status_code=202)
async def request_application_feedback(
    application_id: str,
    data: ScopedReportRequest,
    request: Request,
    auth: AuthContext = Depends(require_api_key_scopes(*SCOPES)),
    db: AsyncSession = Depends(get_db),
):
    require_executor(request)
    job = await start(db, auth, "APPLICATION", data, application_id=application_id)
    await db.commit()
    return status(job)


@router.get("/api/analytics/feedback")
async def read_pipeline_feedback(
    period: str = "30d",
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    auth: AuthContext = Depends(require_api_key_scopes(*READ_SCOPES)),
    db: AsyncSession = Depends(get_db),
):
    if period not in ("7d", "30d", "3m", "all"):
        raise HTTPException(422, "Unsupported period")
    value = await read_pipeline(db, auth, period, as_of, x_timezone)
    await db.commit()
    return value


@router.post("/api/analytics/feedback", status_code=202)
async def request_pipeline_feedback(
    data: PipelineReportRequest,
    request: Request,
    x_timezone: str | None = Depends(get_request_time_zone),
    auth: AuthContext = Depends(require_api_key_scopes(*SCOPES)),
    db: AsyncSession = Depends(get_db),
):
    require_executor(request)
    job = await start(db, auth, "PIPELINE", data, x_timezone=x_timezone)
    await db.commit()
    return status(job)


async def document_application(db, auth, application_id, kind):
    if kind not in ("cv", "cover_letter"):
        raise HTTPException(404, "Document kind not found")
    app = await db.scalar(
        select(Application)
        .where(Application.id == application_id, Application.user_id == auth.user.id)
        .execution_options(populate_existing=True)
    )
    if app is None:
        raise HTTPException(404, "Application not found")
    return app


@router.get("/api/applications/{application_id}/documents/{kind}/text")
async def read_document_text(
    application_id: str,
    kind: str,
    auth: AuthContext = Depends(
        require_api_key_scopes("applications:read", "files:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    app = await document_application(db, auth, application_id, kind)
    return {
        "text": getattr(app, kind + "_text") or "",
        "revision": app.evidence_revision,
        "message": "Current pasted fallback overrides extraction for analysis; not verified historical submission evidence. Extraction supports UTF-8 TXT, DOCX and text PDF (≤10 MB, ≤50 PDF pages, ≤32,000 text characters) when local parsers are installed. No OCR. Replacing/deleting the current file clears this fallback.",
    }


@router.put("/api/applications/{application_id}/documents/{kind}/text")
async def paste_document_text(
    application_id: str,
    kind: str,
    data: DocumentTextPaste,
    auth: AuthContext = Depends(
        require_api_key_scopes("applications:read", "files:read", "files:write")
    ),
    db: AsyncSession = Depends(get_db),
):
    user_id, session_version, key_id = (
        auth.user.id,
        auth.user.session_version,
        auth.api_key.id if auth.api_key else None,
    )
    await lock_ai_settings(db)
    auth = await authority(
        db,
        user_id,
        session_version,
        key_id,
        scopes=["applications:read", "files:read", "files:write"],
    )
    app = await document_application(db, auth, application_id, kind)
    if app.evidence_revision != data.expected_revision:
        raise HTTPException(
            409, "Current document/application changed; reload before replacing text"
        )
    if (getattr(app, kind + "_text") or "") != data.text:
        await invalidate_reports(db, application_id=application_id, removed=True)
        setattr(app, kind + "_text", data.text or None)
        app.evidence_revision += 1
    await db.commit()
    return {"text": data.text, "revision": app.evidence_revision}
