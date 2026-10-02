"""Explicit transcription intent and owner/input-scoped, text-free status."""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AuthContext, require_api_key_scopes
from app.models import ProcessingJob
from app.services.transcription_jobs import SCOPES, job_status, retry_job, start_job
from app.services.transcripts import owned_round

router = APIRouter(tags=["transcriptions"])


def require_executor(request: Request):
    executor = getattr(request.app.state, "transcription_executor", None)
    if (
        executor is None
        or not executor.accepting
        or (executor.task is not None and executor.task.done())
    ):
        raise HTTPException(
            503,
            "Transcription executor is unavailable; ask the operator to check its exclusive ownership",
        )


@router.post("/api/rounds/{round_id}/media/{media_id}/transcription", status_code=202)
async def start_transcription(
    round_id: str,
    media_id: str,
    request: Request,
    request_intent: UUID = Header(),
    expected_transcript_generation: int = Header(ge=0),
    speech_configuration_revision: str = Header(max_length=36),
    auth: AuthContext = Depends(require_api_key_scopes(*SCOPES)),
    db: AsyncSession = Depends(get_db),
):
    require_executor(request)
    job = await start_job(
        db,
        auth,
        round_id,
        media_id,
        str(request_intent),
        expected_transcript_generation,
        speech_configuration_revision,
    )
    await db.commit()
    return job_status(job)


@router.post("/api/transcriptions/{job_id}/retry", status_code=202)
async def retry_transcription(
    job_id: str,
    request: Request,
    request_intent: UUID = Header(),
    auth: AuthContext = Depends(require_api_key_scopes(*SCOPES)),
    db: AsyncSession = Depends(get_db),
):
    require_executor(request)
    job = await retry_job(db, auth, job_id, str(request_intent))
    await db.commit()
    return job_status(job)


@router.get("/api/rounds/{round_id}/transcriptions")
async def list_transcriptions(
    round_id: str,
    auth: AuthContext = Depends(require_api_key_scopes("files:read", "rounds:read")),
    db: AsyncSession = Depends(get_db),
):
    await owned_round(db, round_id, auth.user.id)
    jobs = (
        await db.scalars(
            select(ProcessingJob)
            .where(
                ProcessingJob.round_id == round_id,
                ProcessingJob.user_id == auth.user.id,
            )
            .order_by(ProcessingJob.created_at.desc())
            .limit(20)
        )
    ).all()
    return [job_status(job) for job in jobs]


@router.get("/api/transcriptions/{job_id}")
async def read_transcription(
    job_id: str,
    auth: AuthContext = Depends(require_api_key_scopes("files:read", "rounds:read")),
    db: AsyncSession = Depends(get_db),
):
    job = await db.scalar(
        select(ProcessingJob).where(
            ProcessingJob.id == job_id, ProcessingJob.user_id == auth.user.id
        )
    )
    if job is None:
        raise HTTPException(404, "Transcription not found")
    await owned_round(db, job.round_id, auth.user.id)
    return job_status(job)
