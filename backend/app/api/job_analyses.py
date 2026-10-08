"""Explicit owner-scoped analysis requests. Reading never starts work."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.transcriptions import require_executor
from app.core.database import get_db
from app.core.deps import AuthContext, check_api_key_scope, get_current_auth_context
from app.models.job_analysis import JobAnalysis
from app.schemas.job_analysis import (
    ApplyAnalysis,
    CreateAnalysis,
    DiscardAnalysis,
    Kind,
    ReviewAnalysis,
    RunAnalysis,
)
from app.services import job_analyses as service

router = APIRouter(prefix="/api/job-analyses", tags=["job-analyses"])


async def permit(db, auth, row, write=False):
    prefix = "job_leads" if row.lead_id else "applications"
    check_api_key_scope(auth, prefix + (":write" if write else ":read"))
    if row.kind != "EXTRACTION":
        check_api_key_scope(auth, "profile:read")
    if write:
        from app.services.ai_settings import lock_ai_settings
        from app.services.interview_jobs import authority

        await lock_ai_settings(db)
        await authority(
            db,
            auth.user.id,
            auth.user.session_version,
            auth.api_key.id if auth.api_key else None,
            scopes=[
                prefix + ":write",
                *(["profile:read"] if row.kind != "EXTRACTION" else []),
            ],
        )


@router.get("")
async def latest(
    kind: Kind,
    lead_id: str | None = None,
    application_id: str | None = None,
    round_id: str | None = None,
    auth: AuthContext = Depends(get_current_auth_context),
    db: AsyncSession = Depends(get_db),
):
    from fastapi import HTTPException

    if bool(lead_id) == bool(application_id):
        raise HTTPException(422, "Exactly one target is required")
    probe = JobAnalysis(
        user_id=auth.user.id,
        kind=kind,
        lead_id=lead_id,
        application_id=application_id,
        round_id=round_id,
    )
    await permit(db, auth, probe)
    await service.target(db, probe)
    row = await db.scalar(
        select(JobAnalysis)
        .where(
            JobAnalysis.user_id == auth.user.id,
            JobAnalysis.kind == kind,
            JobAnalysis.lead_id == lead_id,
            JobAnalysis.application_id == application_id,
            JobAnalysis.round_id == round_id,
        )
        .order_by(JobAnalysis.created_at.desc())
        .limit(1)
    )
    data, _ = await service.inputs(db, probe)
    return {
        "analysis": await service.view(db, row) if row else None,
        "requirements": data.get("requirements", []),
        "profile": data.get("profile", []),
    }


@router.post("", status_code=201)
async def create(
    data: CreateAnalysis,
    auth: AuthContext = Depends(get_current_auth_context),
    db: AsyncSession = Depends(get_db),
):
    await permit(db, auth, data, True)
    row = await service.create(db, auth.user.id, data)
    await db.commit()
    return await service.view(db, row)


@router.get("/{analysis_id}")
async def read(
    analysis_id: str,
    auth: AuthContext = Depends(get_current_auth_context),
    db: AsyncSession = Depends(get_db),
):
    row = await service.owned(db, auth.user.id, analysis_id)
    await permit(db, auth, row)
    return await service.view(db, row)


@router.post("/{analysis_id}/run", status_code=202)
async def run(
    analysis_id: str,
    data: RunAnalysis,
    request: Request,
    auth: AuthContext = Depends(get_current_auth_context),
    db: AsyncSession = Depends(get_db),
):
    require_executor(request)
    row = await service.owned(db, auth.user.id, analysis_id)
    await permit(db, auth, row, True)
    await service.start(db, auth, row, data)
    await db.commit()
    return await service.view(db, row)


@router.patch("/{analysis_id}/review")
async def review(
    analysis_id: str,
    data: ReviewAnalysis,
    auth: AuthContext = Depends(get_current_auth_context),
    db: AsyncSession = Depends(get_db),
):
    row = await service.owned(db, auth.user.id, analysis_id)
    await permit(db, auth, row, True)
    row = await service.review(db, row, data)
    await db.commit()
    return await service.view(db, row)


@router.post("/{analysis_id}/apply")
async def apply(
    analysis_id: str,
    data: ApplyAnalysis,
    auth: AuthContext = Depends(get_current_auth_context),
    db: AsyncSession = Depends(get_db),
):
    row = await service.owned(db, auth.user.id, analysis_id)
    await permit(db, auth, row, True)
    row = await service.apply(db, row, data)
    await db.commit()
    return await service.view(db, row)


@router.post("/{analysis_id}/discard")
async def discard(
    analysis_id: str,
    data: DiscardAnalysis,
    auth: AuthContext = Depends(get_current_auth_context),
    db: AsyncSession = Depends(get_db),
):
    from fastapi import HTTPException

    from app.services.ai_settings import lock_ai_settings

    await lock_ai_settings(db)
    row = await service.owned(db, auth.user.id, analysis_id)
    await permit(db, auth, row, True)
    if row.kind != "PREPARATION" or row.revision != data.expected_revision:
        raise HTTPException(409, "Draft changed")
    row.review_state = "discarded"
    row.revision += 1
    await db.commit()
    return await service.view(db, row)
