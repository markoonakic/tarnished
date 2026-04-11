from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import User
from app.models.transfer_job import TransferJob


@pytest.fixture
async def cleanup_user(db: AsyncSession) -> User:
    user = User(
        email="transfer-cleanup@example.com",
        password_hash=get_password_hash("testpass123"),
        is_active=True,
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_cleanup_report_identifies_expired_export_artifacts_and_jobs(
    db: AsyncSession,
    cleanup_user: User,
    tmp_path: Path,
):
    from app.services.transfer_job_cleanup import build_transfer_job_cleanup_report

    stale_artifact = tmp_path / "stale-export.zip"
    fresh_artifact = tmp_path / "fresh-export.zip"
    stale_artifact.write_bytes(b"old")
    fresh_artifact.write_bytes(b"new")

    now = datetime.now(UTC)
    stale_job = TransferJob(
        user_id=cleanup_user.id,
        job_type="export_zip",
        status="complete",
        artifact_path=str(stale_artifact),
        created_at=now - timedelta(days=10),
        updated_at=now - timedelta(days=10),
        completed_at=now - timedelta(days=10),
        result={"filename": "stale-export.zip"},
    )
    fresh_job = TransferJob(
        user_id=cleanup_user.id,
        job_type="export_zip",
        status="complete",
        artifact_path=str(fresh_artifact),
        created_at=now - timedelta(hours=1),
        updated_at=now - timedelta(hours=1),
        completed_at=now - timedelta(hours=1),
        result={"filename": "fresh-export.zip"},
    )
    failed_job = TransferJob(
        user_id=cleanup_user.id,
        job_type="import_zip",
        status="failed",
        created_at=now - timedelta(days=40),
        updated_at=now - timedelta(days=40),
        completed_at=now - timedelta(days=40),
        error={"error": "boom"},
    )
    db.add_all([stale_job, fresh_job, failed_job])
    await db.commit()

    report = await build_transfer_job_cleanup_report(db, now=now)

    assert stale_artifact.resolve() in report.expired_artifact_paths
    assert fresh_artifact.resolve() not in report.expired_artifact_paths
    assert failed_job.id in report.expired_job_ids
    assert stale_job.id in report.expired_job_ids
    assert fresh_job.id not in report.expired_job_ids


@pytest.mark.asyncio
async def test_apply_transfer_job_cleanup_deletes_artifacts_and_rows(
    db: AsyncSession,
    cleanup_user: User,
    tmp_path: Path,
):
    from app.services.transfer_job_cleanup import (
        apply_transfer_job_cleanup,
        build_transfer_job_cleanup_report,
    )

    artifact = tmp_path / "expired-export.zip"
    artifact.write_bytes(b"archive")

    now = datetime.now(UTC)
    job = TransferJob(
        user_id=cleanup_user.id,
        job_type="export_zip",
        status="complete",
        artifact_path=str(artifact),
        created_at=now - timedelta(days=10),
        updated_at=now - timedelta(days=10),
        completed_at=now - timedelta(days=10),
        result={"filename": "expired-export.zip"},
    )
    db.add(job)
    await db.commit()

    report = await build_transfer_job_cleanup_report(db, now=now)
    cleaned = await apply_transfer_job_cleanup(db, report, delete=True)

    assert not artifact.exists()
    assert cleaned.deleted_artifact_paths == [artifact.resolve()]
    assert cleaned.deleted_job_ids == [job.id]
