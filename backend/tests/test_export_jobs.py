import io
import zipfile
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import Application, ApplicationStatus, User
from app.models.transfer_job import TransferJob


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="export-jobs@example.com",
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


@pytest.fixture
async def status(db: AsyncSession) -> ApplicationStatus:
    status = ApplicationStatus(
        name="Applied",
        color="#83a598",
        is_default=True,
        user_id=None,
        order=1,
    )
    db.add(status)
    await db.commit()
    await db.refresh(status)
    return status


async def wait_for_export_completion(
    client: AsyncClient,
    headers: dict[str, str],
    job_id: str,
    *,
    timeout_seconds: float = 6.0,
) -> dict:
    deadline = __import__("asyncio").get_running_loop().time() + timeout_seconds
    while True:
        response = await client.get(
            f"/api/export/zip-jobs/{job_id}",
            headers=headers,
        )
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] == "complete":
            return payload
        if payload["status"] == "failed":
            raise AssertionError(f"Export failed unexpectedly: {payload}")
        if __import__("asyncio").get_running_loop().time() >= deadline:
            raise AssertionError(f"Timed out waiting for export {job_id}: {payload}")
        await __import__("asyncio").sleep(0.1)


@pytest.mark.asyncio
async def test_export_zip_job_start_returns_202_and_job_id(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    response = await client.post("/api/export/zip-jobs", headers=auth_headers)

    assert response.status_code == 202
    payload = response.json()
    assert payload["job_id"]
    assert payload["status"] == "queued"


@pytest.mark.asyncio
async def test_export_zip_job_status_returns_404_for_unknown_job(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    response = await client.get(
        "/api/export/zip-jobs/missing-job",
        headers=auth_headers,
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_export_zip_job_download_returns_archive_when_ready(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict[str, str],
    status: ApplicationStatus,
) -> None:
    application = Application(
        user_id=test_user.id,
        company="Export Jobs Co",
        job_title="Platform Engineer",
        status_id=status.id,
        applied_at=__import__("datetime").date.today(),
    )
    db.add(application)
    await db.commit()

    start_response = await client.post("/api/export/zip-jobs", headers=auth_headers)
    assert start_response.status_code == 202
    job_id = start_response.json()["job_id"]

    completed = await wait_for_export_completion(client, auth_headers, job_id)
    assert completed["result"]["filename"].endswith(".zip")

    download_response = await client.get(
        f"/api/export/zip-jobs/{job_id}/download",
        headers=auth_headers,
    )
    assert download_response.status_code == 200
    assert download_response.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(download_response.content), "r") as zipf:
        assert "manifest.json" in zipf.namelist()
        assert "data.json" in zipf.namelist()


@pytest.mark.asyncio
async def test_failed_export_job_sets_completed_at_for_cleanup(
    db: AsyncSession,
    db_engine,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.api import export as export_api

    job = TransferJob(
        user_id=test_user.id,
        job_type="export_zip",
        status="queued",
        created_at=datetime.now(UTC) - timedelta(days=1),
        updated_at=datetime.now(UTC) - timedelta(days=1),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    job_id = str(job.id)

    monkeypatch.setattr(
        export_api,
        "async_session_maker",
        async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False),
    )
    monkeypatch.setattr(
        export_api,
        "create_zip_export_file",
        __import__("unittest.mock").mock.AsyncMock(side_effect=RuntimeError("boom")),
    )

    with pytest.raises(RuntimeError, match="boom"):
        await export_api.process_export_zip_job(
            job_id=job_id,
            user_id=str(test_user.id),
            user_email=test_user.email,
        )

    await db.rollback()
    result = await db.execute(select(TransferJob).where(TransferJob.id == job_id))
    persisted_job = result.scalar_one()
    assert persisted_job.status == "failed"
    assert persisted_job.completed_at is not None
