from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transfer_job import TransferJob


async def create_transfer_job(
    db: AsyncSession,
    *,
    user_id: str,
    job_type: str,
    status: str,
    stage: str | None = None,
    percent: int = 0,
    message: str | None = None,
    source_path: str | None = None,
    artifact_path: str | None = None,
    result: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> TransferJob:
    job = TransferJob(
        user_id=user_id,
        job_type=job_type,
        status=status,
        stage=stage,
        percent=percent,
        message=message,
        source_path=source_path,
        artifact_path=artifact_path,
        result=result,
        error=error,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def get_transfer_job_for_user(
    db: AsyncSession, *, job_id: str, user_id: str
) -> TransferJob | None:
    result = await db.execute(
        select(TransferJob).where(
            TransferJob.id == job_id, TransferJob.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def update_transfer_job_progress(
    db: AsyncSession,
    *,
    job_id: str,
    status: str | None = None,
    stage: str | None = None,
    percent: int | None = None,
    message: str | None = None,
    source_path: str | None = None,
    artifact_path: str | None = None,
    result: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> TransferJob:
    result_obj = await db.execute(select(TransferJob).where(TransferJob.id == job_id))
    job = result_obj.scalar_one()

    if status is not None:
        job.status = status
    if stage is not None:
        job.stage = stage
    if percent is not None:
        job.percent = percent
    if message is not None:
        job.message = message
    if source_path is not None:
        job.source_path = source_path
    if artifact_path is not None:
        job.artifact_path = artifact_path
    if result is not None:
        job.result = result
    if error is not None:
        job.error = error

    job.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(job)
    return job


async def complete_transfer_job(
    db: AsyncSession,
    *,
    job_id: str,
    status: str = "complete",
    percent: int = 100,
    message: str | None = None,
    result: dict[str, Any] | None = None,
    artifact_path: str | None = None,
) -> TransferJob:
    result_obj = await db.execute(select(TransferJob).where(TransferJob.id == job_id))
    job = result_obj.scalar_one()
    job.status = status
    job.percent = percent
    if message is not None:
        job.message = message
    if result is not None:
        job.result = result
    if artifact_path is not None:
        job.artifact_path = artifact_path
    completed_at = datetime.now(UTC)
    job.completed_at = completed_at
    job.updated_at = completed_at

    await db.commit()
    await db.refresh(job)
    return job


async def fail_transfer_job(
    db: AsyncSession,
    *,
    job_id: str,
    message: str,
    error: dict[str, Any] | None = None,
    stage: str | None = None,
) -> TransferJob:
    result_obj = await db.execute(select(TransferJob).where(TransferJob.id == job_id))
    job = result_obj.scalar_one()
    job.status = "failed"
    job.message = message
    job.error = error
    if stage is not None:
        job.stage = stage
    completed_at = datetime.now(UTC)
    job.completed_at = completed_at
    job.updated_at = completed_at

    await db.commit()
    await db.refresh(job)
    return job


def serialize_transfer_job(job: TransferJob) -> dict[str, Any]:
    success = None
    if job.status == "complete":
        success = True
    elif job.status == "failed":
        success = False

    payload: dict[str, Any] = {
        "job_id": str(job.id),
        "status": job.status,
        "stage": job.stage,
        "percent": job.percent,
        "message": job.message,
        "success": success,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }
    if job.completed_at is not None:
        payload["completed_at"] = job.completed_at.isoformat()
    return payload
