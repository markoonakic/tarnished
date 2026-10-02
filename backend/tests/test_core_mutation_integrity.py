"""Mutation integrity through the API and migrated database."""

import asyncio
from datetime import date

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import create_access_token
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    JobLead,
    Round,
    RoundType,
    User,
)


@pytest.fixture
async def workspace(db, client):
    owner = User(email="owner@core.test", password_hash="unused", is_admin=True)
    other = User(email="other@core.test", password_hash="unused")
    db.add_all([owner, other])
    await db.flush()
    statuses = [
        ApplicationStatus(name=name, user_id=user_id)
        for name, user_id in [
            ("Global", None),
            ("Own", owner.id),
            ("Foreign", other.id),
        ]
    ]
    types = [
        RoundType(name=name, user_id=user_id)
        for name, user_id in [
            ("Global", None),
            ("Own", owner.id),
            ("Foreign", other.id),
        ]
    ]
    db.add_all(statuses + types)
    await db.commit()
    client.headers["Authorization"] = "Bearer " + create_access_token(
        {"sub": owner.id, "session_version": owner.session_version}
    )
    response = await client.post(
        "/api/applications",
        json={
            "company": "Acme",
            "job_title": "Engineer",
            "status_id": statuses[0].id,
            "applied_at": "2026-01-01",
            "salary_min": 85500,
            "location": "Remote",
        },
    )
    assert response.status_code == 201, response.text
    return owner, other, statuses, types, response.json()["id"]


async def test_application_required_inputs_and_nullable_clears(client, db, workspace):
    _, _, statuses, _, app_id = workspace
    path = f"/api/applications/{app_id}"
    for field, invalid in [
        ("company", [None, "", "   ", 12, "x" * 256]),
        ("job_title", [None, "", "  ", False]),
        ("status_id", [None, "", "missing"]),
        ("applied_at", [None, "", "not-a-date", "2026-02-30"]),
    ]:
        for value in invalid:
            response = await client.patch(
                path, json={field: value, "location": "MUTATED"}
            )
            assert 400 <= response.status_code < 500, (field, value, response.text)
            current = (await client.get(path)).json()
            assert current["company"] == "Acme"
            assert current["job_title"] == "Engineer"
            assert current["status"]["id"] == statuses[0].id
            assert current["applied_at"] == "2026-01-01"
            assert current["location"] == "Remote"
    response = await client.patch(
        path,
        json={
            "salary_min": 85500,
            "location": None,
            "recruiter_name": None,
            "skills": None,
        },
    )
    assert response.status_code == 200
    assert response.json()["salary_min"] == 85500
    assert response.json()["location"] is None
    assert response.json()["skills"] == []
    assert (await client.patch(path, json={"salary_min": None})).status_code == 200
    assert (await client.get(path)).json()["salary_min"] is None
    assert await db.scalar(select(func.count(ApplicationStatusHistory.id))) == 1


async def test_status_references_and_history(client, db, workspace):
    _, _, statuses, _, app_id = workspace
    path = f"/api/applications/{app_id}"
    for ref in [statuses[2].id, "missing"]:
        for endpoint, method, body in [
            (path, client.patch, {"status_id": ref}),
            (
                "/api/applications",
                client.post,
                {"company": "New", "job_title": "Role", "status_id": ref},
            ),
            (
                "/api/applications/extract",
                client.post,
                {"url": "https://example.com/job", "status_id": ref},
            ),
        ]:
            assert (await method(endpoint, json=body)).status_code == 400
    for ref in [statuses[1].id, statuses[1].id, statuses[0].id]:
        response = await client.patch(path, json={"status_id": ref})
        assert response.status_code == 200
        assert response.json()["status"]["id"] == ref
    history = (await client.get(path + "/history")).json()
    assert len(history) == 3
    assert [
        (h["from_status"]["id"] if h["from_status"] else None, h["to_status"]["id"])
        for h in reversed(history)
    ] == [
        (None, statuses[0].id),
        (statuses[0].id, statuses[1].id),
        (statuses[1].id, statuses[0].id),
    ]
    assert await db.scalar(select(func.count(Application.id))) == 1


@pytest.mark.parametrize("failure", ["history_insert", "commit"])
async def test_application_status_history_failure_rolls_back(
    client, db, db_engine, workspace, failure
):
    _, _, statuses, _, app_id = workspace
    target_id, initial_id = statuses[1].id, statuses[0].id

    # Fail after the status UPDATE has been flushed, before any history can commit.
    def fail_insert(connection, cursor, statement, parameters, context, executemany):
        if "INSERT INTO application_status_history" in statement:
            raise RuntimeError("injected history insert failure")

    def fail_commit(connection):
        # Both the application UPDATE and history INSERT have reached the DB.
        assert (
            connection.scalar(
                select(Application.status_id).where(Application.id == app_id)
            )
            == target_id
        )
        raise RuntimeError("injected commit failure")

    if failure == "history_insert":
        event.listen(db_engine.sync_engine, "before_cursor_execute", fail_insert)
    else:
        event.listen(db_engine.sync_engine, "commit", fail_commit)
    try:
        with pytest.raises(RuntimeError, match="injected"):
            await client.patch(
                f"/api/applications/{app_id}",
                json={"status_id": target_id, "company": "MUTATED"},
            )
    finally:
        if failure == "history_insert":
            event.remove(db_engine.sync_engine, "before_cursor_execute", fail_insert)
        else:
            event.remove(db_engine.sync_engine, "commit", fail_commit)
    async with async_sessionmaker(db_engine)() as check:
        application = await check.get(Application, app_id)
        assert application is not None
        assert application.status_id == initial_id
        assert application.company == "Acme"
        assert await check.scalar(select(func.count(ApplicationStatusHistory.id))) == 1
    assert not db.in_transaction(), "Router must roll back its failed transaction"


async def test_round_summary_references_required_type_and_clears(client, db, workspace):
    _, _, _, types, app_id = workspace
    path = f"/api/applications/{app_id}/rounds"
    for ref in [None, "", "missing", types[2].id]:
        assert (
            400
            <= (await client.post(path, json={"round_type_id": ref})).status_code
            < 500
        )
    for ref in [types[0].id, types[1].id]:
        response = await client.post(
            path,
            json={
                "round_type_id": ref,
                "transcript_summary": "Saved summary",
                "scheduled_at": "2026-03-29T01:30:00+01:00",
                "notes_summary": "Notes",
            },
        )
        assert response.status_code == 201
        assert response.json()["transcript_summary"] == "Saved summary"
    round_id = response.json()["id"]
    path = f"/api/rounds/{round_id}"
    for ref in [None, "", "missing", types[2].id]:
        assert (
            400
            <= (
                await client.patch(
                    path, json={"round_type_id": ref, "notes_summary": "MUTATED"}
                )
            ).status_code
            < 500
        )
        await db.refresh(await db.get(Round, round_id))
        assert (await db.get(Round, round_id)).notes_summary == "Notes"
    response = await client.patch(
        path,
        json={
            "round_type_id": types[0].id,
            "scheduled_at": None,
            "transcript_summary": None,
            "notes_summary": None,
        },
    )
    assert response.status_code == 200
    for field in ("scheduled_at", "transcript_summary", "notes_summary"):
        assert response.json()[field] is None


async def test_definition_required_inputs(client, db, workspace):
    _, other, statuses, types, _ = workspace
    statuses[0].is_default = True
    types[0].is_default = True
    await db.commit()
    for path, fields in [
        (f"/api/statuses/{statuses[1].id}", ["name", "color"]),
        (f"/api/admin/statuses/{statuses[0].id}", ["name", "color", "order"]),
        (f"/api/round-types/{types[1].id}", ["name"]),
        (f"/api/admin/round-types/{types[0].id}", ["name"]),
        (f"/api/admin/users/{other.id}", ["is_active", "is_admin"]),
    ]:
        for field in fields:
            assert (await client.patch(path, json={field: None})).status_code == 422
    for value in ["false", 0, "invalid", [], {}]:
        assert (
            await client.patch(
                f"/api/admin/users/{other.id}", json={"is_active": value}
            )
        ).status_code == 422
    await db.refresh(other)
    assert other.is_active
    assert not other.is_admin


async def test_in_use_definitions_conflict_without_mutation(client, db, workspace):
    _, _, status_objects, type_objects, app_id = workspace
    statuses = [item.id for item in status_objects]
    types = [item.id for item in type_objects]
    assert (
        await client.patch(
            f"/api/applications/{app_id}", json={"status_id": statuses[1]}
        )
    ).status_code == 200
    response = await client.post(
        f"/api/applications/{app_id}/rounds", json={"round_type_id": types[1]}
    )
    assert response.status_code == 201
    for path in [f"/api/statuses/{statuses[1]}", f"/api/round-types/{types[1]}"]:
        assert (await client.delete(path)).status_code == 409
    # A history-only reference also blocks deletion after the current status changes.
    assert (
        await client.patch(
            f"/api/applications/{app_id}", json={"status_id": statuses[0]}
        )
    ).status_code == 200
    assert (await client.delete(f"/api/statuses/{statuses[1]}")).status_code == 409
    for path in [f"/api/statuses/{statuses[2]}", f"/api/round-types/{types[2]}"]:
        assert (await client.delete(path)).status_code == 403
    assert (await client.delete(f"/api/applications/{app_id}")).status_code == 204
    for path in [f"/api/statuses/{statuses[1]}", f"/api/round-types/{types[1]}"]:
        assert (await client.delete(path)).status_code == 204


async def test_deliberate_user_workspace_delete_with_leads_preserves_other_owner(
    client, db, workspace, tmp_path
):
    owner, other, statuses, types, app_id = workspace
    owner_id, other_id = owner.id, other.id
    blob = tmp_path / "shared.txt"
    blob.write_text("Shared content-addressed test material")
    application = await db.get(Application, app_id)
    application.cv_path = str(blob)
    other_app = Application(
        user_id=other_id,
        company="Other",
        job_title="Keep",
        status_id=statuses[2].id,
        applied_at=date(2026, 1, 1),
        cv_path=str(blob),
    )
    db.add(other_app)
    await db.flush()
    other_app_id = other_app.id
    lead = JobLead(
        user_id=other_id,
        url="https://example.test/converted",
        status="converted",
        converted_to_application_id=other_app.id,
    )
    db.add_all(
        [
            lead,
            JobLead(user_id=other_id, url="https://example.test/pending"),
            JobLead(user_id=owner_id, url="https://example.test/keep"),
        ]
    )
    await db.flush()
    other_app.job_lead_id = lead.id
    db.add_all(
        [
            Round(application_id=other_app.id, round_type_id=types[2].id),
            ApplicationStatusHistory(
                application_id=other_app.id, to_status_id=statuses[2].id
            ),
        ]
    )
    await db.commit()
    response = await client.delete(f"/api/admin/users/{other_id}")
    assert response.status_code == 204, response.text
    db.expire_all()
    assert await db.get(User, other_id) is None
    assert await db.get(Application, other_app_id) is None
    assert (
        await db.scalar(
            select(func.count(JobLead.id)).where(JobLead.user_id == other_id)
        )
        == 0
    )
    assert await db.scalar(select(func.count(Round.id))) == 0
    assert await db.scalar(select(func.count(ApplicationStatusHistory.id))) == 1
    assert await db.get(User, owner_id) is not None
    assert (await db.get(Application, app_id)).cv_path == str(blob)
    assert (
        await db.scalar(
            select(func.count(JobLead.id)).where(JobLead.user_id == owner_id)
        )
        == 1
    )
    assert blob.read_text() == "Shared content-addressed test material"


async def test_concurrent_status_updates_have_one_consistent_history(
    client, db, db_engine, workspace
):
    from app.core.database import get_db
    from app.main import app

    _, _, statuses, _, app_id = workspace
    initial_id, target_id = statuses[0].id, statuses[1].id
    # Force two real requests to read the same initial status before either writes.
    arrived = 0
    both_read = asyncio.Event()

    class RacingSession(AsyncSession):
        paused = False

        async def execute(self, statement, *args, **kwargs):
            nonlocal arrived
            result = await super().execute(statement, *args, **kwargs)
            descriptions = getattr(statement, "column_descriptions", [])
            if (
                not self.paused
                and descriptions
                and descriptions[0].get("entity") is Application
            ):
                self.paused = True
                arrived += 1
                if arrived == 2:
                    both_read.set()
                await asyncio.wait_for(both_read.wait(), timeout=10)
            return result

    factory = async_sessionmaker(
        db_engine, class_=RacingSession, expire_on_commit=False
    )

    async def concurrent_db():
        async with factory() as session:
            yield session

    original = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = concurrent_db
    try:
        responses = await asyncio.wait_for(
            asyncio.gather(
                *[
                    client.patch(
                        f"/api/applications/{app_id}", json={"status_id": target_id}
                    )
                    for _ in range(2)
                ]
            ),
            timeout=20,
        )
    finally:
        app.dependency_overrides[get_db] = original
    assert sorted(response.status_code for response in responses) == [200, 409]
    async with async_sessionmaker(db_engine)() as check:
        application = await check.get(Application, app_id)
        assert application is not None
        assert application.status_id == target_id
        history = (
            await check.scalars(
                select(ApplicationStatusHistory).order_by(
                    ApplicationStatusHistory.changed_at
                )
            )
        ).all()
        assert [(h.from_status_id, h.to_status_id) for h in history] == [
            (None, initial_id),
            (initial_id, target_id),
        ]


async def test_application_create_required_inputs_and_defaults(client, db, workspace):
    _, _, statuses, _, _ = workspace
    payload = {"company": "New", "job_title": "Role", "status_id": statuses[0].id}
    for field in ["company", "job_title", "status_id", "applied_at"]:
        assert (
            await client.post("/api/applications", json={**payload, field: None})
        ).status_code == 422
        assert await db.scalar(select(func.count(Application.id))) == 1
    response = await client.post("/api/applications", json=payload)
    assert response.status_code == 201
    assert response.json()["applied_at"]
    assert (
        await client.post(
            "/api/applications/extract",
            json={
                "url": "https://example.test/job",
                "status_id": statuses[0].id,
                "applied_at": None,
            },
        )
    ).status_code == 422


@pytest.mark.parametrize("failure", ["history_insert", "commit"])
async def test_application_create_failure_is_atomic(
    client, db, db_engine, workspace, failure
):
    _, _, statuses, _, _ = workspace
    payload = {"company": "New", "job_title": "Role", "status_id": statuses[0].id}

    def fail_insert(connection, cursor, statement, parameters, context, executemany):
        if "INSERT INTO application_status_history" in statement:
            raise RuntimeError("injected failure")

    def fail_commit(connection):
        assert connection.scalar(select(func.count(Application.id))) == 2
        assert connection.scalar(select(func.count(ApplicationStatusHistory.id))) == 2
        raise RuntimeError("injected failure")

    event_name = "commit" if failure == "commit" else "before_cursor_execute"
    callback = fail_commit if failure == "commit" else fail_insert
    event.listen(db_engine.sync_engine, event_name, callback)
    try:
        with pytest.raises(RuntimeError, match="injected failure"):
            await client.post("/api/applications", json=payload)
    finally:
        event.remove(db_engine.sync_engine, event_name, callback)
    assert not db.in_transaction()
    async with async_sessionmaker(db_engine)() as check:
        assert await check.scalar(select(func.count(Application.id))) == 1
        assert await check.scalar(select(func.count(ApplicationStatusHistory.id))) == 1


async def test_user_delete_foreign_dependency_conflict_rolls_back(
    client, db, workspace
):
    owner, other, statuses, _, app_id = workspace
    other_id, status_id = other.id, statuses[2].id
    # A legacy/corrupt foreign reference must block, not delete/reassign another workspace.
    application = await db.get(Application, app_id)
    application.status_id = status_id
    lead = JobLead(user_id=other_id, url="https://example.test/still-owned")
    db.add(lead)
    await db.commit()
    lead_id = lead.id
    response = await client.delete(f"/api/admin/users/{other_id}")
    assert response.status_code == 409
    assert await db.get(User, other_id) is not None
    assert await db.get(JobLead, lead_id) is not None
    assert (await db.get(Application, app_id)).status_id == status_id
    assert await db.get(ApplicationStatus, status_id) is not None
