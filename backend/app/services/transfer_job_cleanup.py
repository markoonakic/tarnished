from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transfer_job import TransferJob

EXPORT_ARTIFACT_RETENTION = timedelta(hours=24)
TRANSFER_JOB_RETENTION = timedelta(days=7)


@dataclass
class TransferJobCleanupReport:
    expired_artifact_paths: list[Path]
    expired_job_ids: list[str]
    deleted_artifact_paths: list[Path] = field(default_factory=list)
    deleted_job_ids: list[str] = field(default_factory=list)


async def build_transfer_job_cleanup_report(
    db: AsyncSession,
    *,
    now: datetime | None = None,
    export_artifact_retention: timedelta = EXPORT_ARTIFACT_RETENTION,
    transfer_job_retention: timedelta = TRANSFER_JOB_RETENTION,
) -> TransferJobCleanupReport:
    current_time = now or datetime.now(UTC)
    artifact_cutoff = current_time - export_artifact_retention
    job_cutoff = current_time - transfer_job_retention

    result = await db.execute(select(TransferJob))
    jobs = list(result.scalars().all())

    expired_artifact_paths: list[Path] = []
    expired_job_ids: list[str] = []

    for job in jobs:
        if (
            job.artifact_path
            and job.completed_at
            and job.completed_at <= artifact_cutoff
        ):
            expired_artifact_paths.append(Path(job.artifact_path).resolve())
        if job.completed_at and job.completed_at <= job_cutoff:
            expired_job_ids.append(str(job.id))

    return TransferJobCleanupReport(
        expired_artifact_paths=sorted(set(expired_artifact_paths)),
        expired_job_ids=sorted(set(expired_job_ids)),
    )


async def apply_transfer_job_cleanup(
    db: AsyncSession,
    report: TransferJobCleanupReport,
    *,
    delete: bool = False,
) -> TransferJobCleanupReport:
    if not delete:
        return report

    deleted_artifact_paths: list[Path] = []
    for artifact_path in report.expired_artifact_paths:
        if artifact_path.exists():
            artifact_path.unlink()
            deleted_artifact_paths.append(artifact_path)

    if report.expired_job_ids:
        result = await db.execute(
            select(TransferJob).where(TransferJob.id.in_(report.expired_job_ids))
        )
        jobs = list(result.scalars().all())
        for job in jobs:
            await db.delete(job)
        await db.commit()

    report.deleted_artifact_paths = deleted_artifact_paths
    report.deleted_job_ids = report.expired_job_ids.copy()
    return report
