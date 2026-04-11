import io
import json
import zipfile

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import User


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="transfer-jobs@example.com",
        password_hash=get_password_hash("testpass123"),
        is_active=True,
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_transfer_job_service_creates_and_updates_jobs(
    db: AsyncSession, test_user: User
) -> None:
    from app.services.transfer_jobs import (
        complete_transfer_job,
        create_transfer_job,
        fail_transfer_job,
        update_transfer_job_progress,
    )

    job = await create_transfer_job(
        db,
        user_id=str(test_user.id),
        job_type="import_zip",
        status="queued",
        message="Queued for processing",
    )
    assert job.job_type == "import_zip"
    assert job.status == "queued"
    assert job.percent == 0

    job = await update_transfer_job_progress(
        db,
        job_id=str(job.id),
        status="processing",
        stage="validating",
        percent=25,
        message="Validating archive",
    )
    assert job.status == "processing"
    assert job.stage == "validating"
    assert job.percent == 25

    job = await complete_transfer_job(
        db,
        job_id=str(job.id),
        status="complete",
        percent=100,
        message="Import complete",
        result={"applications": 0},
    )
    assert job.status == "complete"
    assert job.percent == 100
    assert job.result == {"applications": 0}
    assert job.completed_at is not None

    failed_job = await create_transfer_job(
        db,
        user_id=str(test_user.id),
        job_type="export_zip",
        status="queued",
    )
    failed_job = await fail_transfer_job(
        db,
        job_id=str(failed_job.id),
        message="Archive build failed",
        error={"detail": "disk full"},
    )
    assert failed_job.status == "failed"
    assert failed_job.error == {"detail": "disk full"}
    assert failed_job.completed_at is not None


@pytest.mark.asyncio
async def test_import_status_returns_404_for_unknown_job(
    client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    response = await client.get(
        "/api/import/status/does-not-exist",
        headers=auth_headers,
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_import_start_returns_202_and_persists_job(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.models.transfer_job import TransferJob

    async def noop_schedule(*args, **kwargs):
        return None

    monkeypatch.setattr(
        "app.api.import_router.schedule_import_processing", noop_schedule
    )

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr(
            "data.json", json.dumps({"format_version": "1.0.0", "models": {}})
        )
    zip_buffer.seek(0)

    response = await client.post(
        "/api/import/import",
        headers=auth_headers,
        files={"file": ("import.zip", zip_buffer, "application/zip")},
        data={"override": "false"},
    )

    assert response.status_code == 202
    payload = response.json()
    assert payload["status"] == "queued"
    assert payload["job_id"]
    assert payload["import_id"] == payload["job_id"]

    result = await db.execute(
        select(TransferJob).where(TransferJob.id == payload["job_id"])
    )
    job = result.scalar_one()
    assert job.user_id == test_user.id
    assert job.job_type == "import_zip"
    assert job.status == "queued"
