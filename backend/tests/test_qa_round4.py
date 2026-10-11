"""Release QA: safe attachment/import retries and cross-account database contention."""

import asyncio
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace

from app.api import import_router
from app.core.database import get_db
from app.main import app
from app.models.transfer_job import TransferJob
from app.models.workspace import ApplicationDocument


async def test_attachment_retry_recovers_one_file_and_checks_content(
    client, db, workspace
):
    path = f"/api/applications/{workspace[4]}/attachments"
    key = str(uuid4())
    headers = {"Idempotency-Key": key}
    payload = {
        "files": {"file": ("work.txt", b"My work")},
        "data": {"kind": "task"},
        "headers": headers,
    }
    first = await client.post(path, **payload)
    retry = await client.post(path, **payload)
    assert first.status_code == retry.status_code == 201
    assert first.json()["id"] == retry.json()["id"] == key
    changed = await client.post(
        path,
        files={"file": ("work.txt", b"Changed")},
        data={"kind": "task"},
        headers=headers,
    )
    assert changed.status_code == 409
    assert changed.json()["detail"]["code"] == "create_content_changed"
    assert await db.scalar(select(func.count()).select_from(ApplicationDocument)) == 1
    # A deliberately selected second file is still a separate upload intent.
    another = await client.post(
        path, **{**payload, "headers": {"Idempotency-Key": str(uuid4())}}
    )
    assert another.status_code == 201 and another.json()["id"] != key


async def test_simultaneous_attachment_retry_creates_one_row(
    client, db_engine, workspace
):
    factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def sessions():
        async with factory() as session:
            yield session

    original = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = sessions
    key = str(uuid4())
    try:
        responses = await asyncio.gather(
            *[
                client.post(
                    f"/api/applications/{workspace[4]}/attachments",
                    files={"file": ("work.txt", b"My work")},
                    data={"kind": "portfolio"},
                    headers={"Idempotency-Key": key},
                )
                for _ in range(2)
            ]
        )
        assert [r.status_code for r in responses] == [201, 201]
        assert {r.json()["id"] for r in responses} == {key}
    finally:
        app.dependency_overrides[get_db] = original


async def test_import_upload_retry_recovers_the_job_without_rescheduling(
    client, db, workspace, monkeypatch
):
    scheduled = []

    async def schedule(*args, **kwargs):
        scheduled.append(kwargs)

    monkeypatch.setattr(import_router, "schedule_import_processing", schedule)
    key = str(uuid4())
    payload = {
        "files": {"file": ("archive.zip", b"archive")},
        "headers": {"Idempotency-Key": key},
    }
    try:
        first = await client.post("/api/import/import", **payload)
        retry = await client.post("/api/import/import", **payload)
        assert first.status_code == retry.status_code == 202
        assert first.json()["import_id"] == retry.json()["import_id"] == key
        assert len(scheduled) == 1
        assert await db.scalar(select(func.count()).select_from(TransferJob)) == 1
    finally:
        for job in scheduled:
            import_router.delete_temp_file(job["temp_path"])


async def test_profile_save_under_another_accounts_write_lock(
    client, db_engine, workspace
):
    owner, other, *_ = workspace
    is_sqlite = db_engine.dialect.name == "sqlite"
    # Create the profile before the competing transaction starts.
    profile = (await client.get("/api/profile")).json()
    factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def sessions():
        async with factory() as session:
            if is_sqlite:
                await session.execute(text("PRAGMA busy_timeout=30"))
            yield session

    original = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = sessions
    try:
        async with factory() as blocking:
            await blocking.execute(
                text("UPDATE users SET email=email WHERE id=:id"), {"id": other.id}
            )
            response = await client.put(
                "/api/profile",
                json={"city": "Safe draft", "expected_revision": profile["revision"]},
            )
            # SQLite locks all writers; PostgreSQL locks only the other user's row.
            if is_sqlite:
                assert response.status_code == 503
                assert response.json() == {"code": "database_busy"}
                assert response.headers["retry-after"] == "1"
            else:
                assert response.status_code == 200
                assert response.json()["city"] == "Safe draft"
                profile = response.json()
            await blocking.rollback()
        saved = await client.put(
            "/api/profile",
            json={"city": "Safe draft", "expected_revision": profile["revision"]},
        )
        assert saved.status_code == 200 and saved.json()["city"] == "Safe draft"
    finally:
        app.dependency_overrides[get_db] = original
