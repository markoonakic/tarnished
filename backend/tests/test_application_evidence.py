"""Application evidence recorded through the API."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event

from app.core.security import create_access_token
from app.models import (
    Application,
    ApplicationStatusHistory,
    JobLead,
    RoundType,
    User,
)


@pytest.fixture
async def evidence_workspace(client, db):
    owner = User(email="evidence@synthetic.test", password_hash="unused", is_admin=True)
    other = User(email="other-evidence@synthetic.test", password_hash="unused")
    db.add_all([owner, other])
    await db.commit()
    client.headers["Authorization"] = "Bearer " + create_access_token(
        {"sub": owner.id, "session_version": owner.session_version}
    )
    result = await client.post(
        "/api/statuses", json={"name": "Custom reply", "meaning": "interviewing"}
    )
    assert result.status_code == 201, result.text
    status = result.json()
    result = await client.post(
        "/api/applications",
        json={"company": "Synthetic", "job_title": "Role", "status_id": status["id"]},
    )
    assert result.status_code == 201, result.text
    return owner, other, status, result.json()


async def test_prospective_meaning_and_no_implicit_response(
    client, db, evidence_workspace
):
    owner, _, status, application = evidence_workspace
    path = "/api/applications/" + application["id"]
    assert application["status_meaning"] == "interviewing"
    assert application["response_state"] == "not_recorded"
    assert (
        await client.patch(
            "/api/statuses/" + status["id"],
            json={"name": "Renamed", "meaning": "rejected"},
        )
    ).status_code == 200
    current = (await client.get(path)).json()
    assert current["status"]["meaning"] == "rejected"
    assert current["status_meaning"] == "interviewing"
    history = (await client.get(path + "/history")).json()
    assert history[0]["to_meaning"] == "interviewing"
    assert history[0]["time_provenance"] == "recorded"
    # A same-ID status save is not a meaning correction or response.
    assert (await client.patch(path, json={"status_id": status["id"]})).json()[
        "status_meaning"
    ] == "interviewing"
    round_type = RoundType(name="Synthetic", user_id=owner.id)
    db.add(round_type)
    await db.commit()
    assert (
        await client.post(path + "/rounds", json={"round_type_id": round_type.id})
    ).status_code == 201
    assert (await client.get(path)).json()["response_state"] == "not_recorded"
    later = await client.post(
        "/api/applications",
        json={"company": "Later", "job_title": "Role", "status_id": status["id"]},
    )
    assert later.json()["status_meaning"] == "rejected"
    assert later.json()["response_state"] == "not_recorded"


async def test_explicit_response_clear_omission_and_atomic_outcome(
    client, db, evidence_workspace
):
    _, _, status, application = evidence_workspace
    path = "/api/applications/" + application["id"]
    result = await client.patch(path, json={"response_evidence": {}})
    assert result.status_code == 200, result.text
    fact = result.json()
    assert fact["response_state"] == "recorded"
    assert fact["response_recorded_at"] and fact["response_occurred_on"] is None
    assert (await client.patch(path, json={"company": "Edited"})).json()[
        "response_recorded_at"
    ] == fact["response_recorded_at"]
    result = await client.patch(path, json={"response_evidence": None})
    assert result.json()["response_state"] == "not_recorded"
    assert all(
        result.json()[f] is None
        for f in ["response_recorded_at", "response_occurred_on", "response_reference"]
    )
    rejection = (
        await client.post(
            "/api/statuses", json={"name": "Declined", "meaning": "rejected"}
        )
    ).json()
    result = await client.patch(
        path,
        json={
            "status_id": rejection["id"],
            "response_evidence": {
                "occurred_on": "2026-01-01",
                "reference": "Employer outcome",
            },
        },
    )
    assert result.json()["response_state"] == "recorded"
    assert result.json()["status_meaning"] == "rejected"
    recorded_at = result.json()["response_recorded_at"]
    result = await client.patch(path, json={"response_evidence": {"reference": None}})
    assert result.json()["response_occurred_on"] == "2026-01-01"
    assert result.json()["response_recorded_at"] == recorded_at
    assert result.json()["response_reference"] is None
    result = await client.patch(path, json={"response_evidence": {"occurred_on": None}})
    assert result.json()["response_occurred_on"] is None
    assert result.json()["response_state"] == "recorded"
    assert result.json()["response_recorded_at"] == recorded_at
    assert (await client.get(path + "/history")).json()[0][
        "from_meaning"
    ] == "interviewing"
    for body in [
        {"response_evidence": {"automatic_receipt": True}},
        {"response_evidence": {"occurred_on": "2999-01-01"}},
    ]:
        assert (await client.patch(path, json=body)).status_code == 422
    created = await client.post(
        "/api/applications",
        json={
            "company": "Explicit",
            "job_title": "Role",
            "status_id": status["id"],
            "response_evidence": {},
        },
    )
    assert created.json()["response_state"] == "recorded"


async def test_corrections_are_field_local_and_gaps_are_content_free(
    client, db, evidence_workspace
):
    owner, _, status, application = evidence_workspace
    legacy = Application(
        user_id=owner.id, company="Legacy", job_title="Role", status_id=status["id"]
    )
    db.add(legacy)
    await db.flush()
    now = datetime.now(UTC)
    entries = [
        ApplicationStatusHistory(
            application_id=legacy.id,
            from_status_id=status["id"],
            to_status_id=status["id"],
            changed_at=now - timedelta(days=3 - i),
            note="private deleted note",
        )
        for i in range(3)
    ]
    db.add_all(entries)
    await db.commit()
    path = "/api/applications/" + legacy.id
    correction = await client.patch(
        path + "/history/" + entries[1].id,
        json={
            "expected_revision": 0,
            "to_meaning": "offer",
            "correction_note": "optional",
        },
    )
    assert correction.status_code == 200, correction.text
    history = (await client.get(path + "/history")).json()
    middle = history[1]
    assert middle["to_meaning_provenance"] == "recorded"
    assert (
        middle["from_meaning_provenance"]
        == middle["time_provenance"]
        == "legacy_unknown"
    )
    assert (await client.get(path)).json()[
        "status_meaning_provenance"
    ] == "legacy_unknown"
    assert (
        await client.patch(
            path + "/history/" + entries[1].id,
            json={
                "expected_revision": 1,
                "changed_at": (now - timedelta(days=4)).isoformat(),
            },
        )
    ).status_code == 422
    assert (
        await client.delete(path + "/history/" + entries[1].id + "?expected_revision=1")
    ).status_code == 204
    gap = (await client.get(path + "/history")).json()[1]
    assert gap["is_gap"]
    assert all(
        gap[f] is None
        for f in [
            "from_status",
            "to_status",
            "from_meaning",
            "to_meaning",
            "note",
            "correction_note",
            "corrected_at",
        ]
    )
    assert len((await client.get(path + "/history")).json()) == 3
    assert (
        await client.patch(
            path + "/history/" + entries[1].id,
            json={"expected_revision": 2, "to_meaning": "applied"},
        )
    ).status_code == 409
    assert (
        await client.patch(
            path + "/meaning", json={"expected_revision": 2, "meaning": "offer"}
        )
    ).status_code == 200
    assert (
        await client.patch(
            path + "/meaning", json={"expected_revision": 3, "meaning": "interviewing"}
        )
    ).status_code == 200
    current = (await client.get(path)).json()
    assert current["status_meaning"] == "interviewing"
    assert current["response_state"] == "legacy_unknown"
    assert sum(h["is_gap"] for h in (await client.get(path + "/history")).json()) == 3
    assert (await client.get("/api/analytics/sankey")).status_code == 200


async def test_evidence_scope_cas_and_rollback(
    client, db, db_engine, evidence_workspace
):
    owner, other, status, application = evidence_workspace
    path = "/api/applications/" + application["id"]
    event_id = (await client.get(path + "/history")).json()[0]["id"]
    foreign = Application(
        user_id=other.id, company="Foreign", job_title="Role", status_id=status["id"]
    )
    db.add(foreign)
    await db.commit()
    foreign_path = "/api/applications/" + foreign.id
    for endpoint, body in [
        (foreign_path + "/meaning", {"expected_revision": 0, "meaning": "offer"}),
        (
            foreign_path + "/history/" + event_id,
            {"expected_revision": 0, "to_meaning": "offer"},
        ),
    ]:
        assert (await client.patch(endpoint, json=body)).status_code == 404
    assert (
        await client.patch(path, json={"expected_revision": 4, "response_evidence": {}})
    ).status_code == 409
    assert (await client.get(path)).json()["response_state"] == "not_recorded"

    def fail_commit(connection):
        raise RuntimeError("evidence rollback injection")

    event.listen(db_engine.sync_engine, "commit", fail_commit)
    try:
        with pytest.raises(RuntimeError, match="evidence rollback injection"):
            await client.patch(path, json={"response_evidence": {}})
    finally:
        event.remove(db_engine.sync_engine, "commit", fail_commit)
    assert (await client.get(path)).json()["response_state"] == "not_recorded"
    assert (await client.get(path)).json()["evidence_revision"] == 0


async def test_extracted_and_lead_creation_snapshot_without_inference(
    client, db, evidence_workspace, monkeypatch
):
    from app.api import applications
    from app.schemas.job_lead import JobLeadExtractionInput
    from app.services.ai_settings import AISettingsState

    owner, _, status, application = evidence_workspace
    extracted_at = None

    async def fake_extract(**kwargs):
        nonlocal extracted_at
        extracted_at = datetime.now(UTC)
        return JobLeadExtractionInput.model_validate(
            {"company": "Mock", "title": "Role"}
        )

    async def fake_settings(*args, **kwargs):
        return AISettingsState(
            model="openai/synthetic-text",
            api_key=None,
            base_url="http://127.0.0.1:4000/v1",
            keyless=True,
        )

    from app.models import ApplicationStatus

    db.add(
        ApplicationStatus(
            name="Preparing",
            meaning="preparing",
            user_id=owner.id,
            is_default=False,
            order=99,
        )
    )
    await db.commit()
    monkeypatch.setattr("app.services.job_analyses.get_ai_settings", fake_settings)
    monkeypatch.setattr(applications, "extract_job_data", fake_extract)
    result = await client.post(
        "/api/applications/extract",
        json={
            "url": "https://synthetic.test/job",
            "text": "Synthetic job",
            "status_id": status["id"],
            "response_evidence": {},
        },
    )
    assert result.status_code == 201, result.text
    assert result.json()["response_state"] == "recorded"
    assert result.json()["status_meaning"] == "preparing"
    assert extracted_at is None
    assert result.json()["response_recorded_at"] is not None
    assert result.json()["pending_analysis_id"]
    lead = JobLead(
        user_id=owner.id,
        company="Synthetic",
        title="Role",
        url="https://synthetic.test/lead",
        status="extracted",
    )
    db.add(lead)
    await db.commit()
    result = await client.post(f"/api/job-leads/{lead.id}/convert")
    assert result.status_code == 201, result.text
    assert result.json()["status_meaning"] == "interviewing"
    assert result.json()["response_state"] == "not_recorded"


@pytest.mark.parametrize("text", [None, "Synthetic job"])
async def test_extraction_rejects_future_response_before_fetch_or_provider(
    client, db, evidence_workspace, monkeypatch, text
):
    from unittest.mock import AsyncMock

    from sqlalchemy import select

    from app.api import applications
    from app.schemas.job_lead import JobLeadExtractionInput

    owner, _, status, application = evidence_workspace
    fetch = AsyncMock(return_value="<p>Synthetic job</p>")
    extract = AsyncMock(
        return_value=JobLeadExtractionInput.model_validate(
            {"company": "Mock", "title": "Role"}
        )
    )
    monkeypatch.setattr(applications, "fetch_job_posting_html", fetch)
    monkeypatch.setattr(applications, "extract_job_data", extract)
    result = await client.post(
        "/api/applications/extract",
        json={
            "url": "https://synthetic.test/job",
            "text": text,
            "status_id": status["id"],
            "response_evidence": {"occurred_on": "2999-01-01"},
        },
    )
    assert result.status_code == 422, result.text
    assert result.json()["detail"] == "Response date cannot be in the future"
    fetch.assert_not_called()
    extract.assert_not_called()
    assert list(
        await db.scalars(select(Application.id).where(Application.user_id == owner.id))
    ) == [application["id"]]


async def test_response_only_writers_compare_revisions(
    client, db, db_engine, evidence_workspace
):
    import asyncio

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.core.database import get_db
    from app.main import app

    _, _, _, application = evidence_workspace
    both_read = asyncio.Event()
    arrived = 0

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
                await asyncio.wait_for(both_read.wait(), 10)
            return result

    factory = async_sessionmaker(
        db_engine, class_=RacingSession, expire_on_commit=False
    )

    async def concurrent_db():
        async with factory() as session:
            yield session

    original = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = concurrent_db
    path = "/api/applications/" + application["id"]
    try:
        responses = await asyncio.wait_for(
            asyncio.gather(
                *[
                    client.patch(
                        path, json={"response_evidence": {"reference": reference}}
                    )
                    for reference in ["First", "Second"]
                ]
            ),
            20,
        )
    finally:
        app.dependency_overrides[get_db] = original
    assert sorted(response.status_code for response in responses) == [200, 409]
    current = (await client.get(path)).json()
    assert current["evidence_revision"] == 1 and current["response_state"] == "recorded"
    assert len((await client.get(path + "/history")).json()) == 1


async def test_evidence_requires_write_scope(client, db, evidence_workspace):
    from app.core.security import generate_api_token, hash_api_key
    from app.models import UserAPIKey

    owner, _, _, application = evidence_workspace
    path = "/api/applications/" + application["id"]
    history_id = (await client.get(path + "/history")).json()[0]["id"]
    raw = generate_api_token()
    db.add(
        UserAPIKey(
            user_id=owner.id,
            label="Synthetic read only",
            key_hash=hash_api_key(raw),
            key_prefix=raw[:8],
            scopes=["applications:read"],
        )
    )
    await db.commit()
    client.headers.pop("Authorization")
    client.headers["X-API-Key"] = raw
    assert (await client.get(path + "/history")).status_code == 200
    for endpoint, body in [
        (path, {"response_evidence": {}}),
        (path + "/meaning", {"meaning": "offer", "expected_revision": 0}),
        (
            path + "/history/" + history_id,
            {"to_meaning": "offer", "expected_revision": 0},
        ),
    ]:
        assert (await client.patch(endpoint, json=body)).status_code == 403
    assert (await client.delete(path + "/history/" + history_id)).status_code == 403


@pytest.mark.parametrize("action", ["correction", "delete", "current_meaning"])
async def test_history_and_current_corrections_rollback(
    client, db, db_engine, evidence_workspace, action
):
    _, _, _, application = evidence_workspace
    path = "/api/applications/" + application["id"]
    before = (await client.get(path + "/history")).json()
    history_path = path + "/history/" + before[0]["id"]

    def fail_commit(connection):
        raise RuntimeError("history rollback injection")

    event.listen(db_engine.sync_engine, "commit", fail_commit)
    try:
        with pytest.raises(RuntimeError, match="history rollback injection"):
            if action == "delete":
                await client.delete(history_path)
            elif action == "correction":
                await client.patch(
                    history_path, json={"expected_revision": 0, "to_meaning": "offer"}
                )
            else:
                await client.patch(
                    path + "/meaning", json={"expected_revision": 0, "meaning": "offer"}
                )
    finally:
        event.remove(db_engine.sync_engine, "commit", fail_commit)
    assert (await client.get(path + "/history")).json() == before
    assert (await client.get(path)).json()["evidence_revision"] == 0
    assert (await client.get(path)).json()["status_meaning"] == "interviewing"


async def test_timestamp_correction_does_not_certify_legacy_meanings(
    client, db, evidence_workspace
):
    owner, _, status, _ = evidence_workspace
    application = Application(
        user_id=owner.id,
        company="Legacy timestamp",
        job_title="Role",
        status_id=status["id"],
    )
    db.add(application)
    await db.flush()
    entry = ApplicationStatusHistory(
        application_id=application.id, to_status_id=status["id"], note="Preserved"
    )
    db.add(entry)
    await db.commit()
    path = "/api/applications/" + application.id + "/history"
    for changed_at in [None, "2026-01-01T00:00:00", "2999-01-01T00:00:00Z"]:
        assert (
            await client.patch(
                path + "/" + entry.id,
                json={"expected_revision": 0, "changed_at": changed_at},
            )
        ).status_code == 422
    result = await client.patch(
        path + "/" + entry.id,
        json={"expected_revision": 0, "changed_at": "2026-01-01T01:00:00+01:00"},
    )
    assert result.status_code == 200, result.text
    history = (await client.get(path)).json()[0]
    assert history["changed_at"].startswith("2026-01-01T00:00:00")
    assert history["time_provenance"] == "recorded"
    assert history["to_meaning_provenance"] == "legacy_unknown"


async def test_seeded_meaning_and_admin_rename_are_independent_of_spelling(
    client, db, evidence_workspace
):
    from sqlalchemy import select

    from app.core.seed import seed_defaults
    from app.models import ApplicationStatus

    await seed_defaults(db)
    rejected = await db.scalar(
        select(ApplicationStatus).where(
            ApplicationStatus.user_id.is_(None), ApplicationStatus.name == "Rejected"
        )
    )
    assert rejected.meaning == "rejected"
    result = await client.patch(
        "/api/admin/statuses/" + rejected.id, json={"name": "Declined"}
    )
    assert result.status_code == 200, result.text
    assert result.json()["meaning"] == "rejected"
    assert (
        await client.patch("/api/statuses/" + rejected.id, json={"meaning": "offer"})
    ).status_code == 403
    own = (await client.post("/api/statuses", json={"name": "Rejected"})).json()
    assert own["meaning"] == "unknown"
    _, other, _, _ = evidence_workspace
    foreign_default = ApplicationStatus(
        name="Legacy imported default flag", user_id=other.id, is_default=True
    )
    db.add(foreign_default)
    await db.commit()
    assert (
        await client.patch(
            "/api/admin/statuses/" + foreign_default.id, json={"meaning": "offer"}
        )
    ).status_code == 404


async def test_supplied_revision_cannot_authorize_a_stale_snapshot(
    db, db_engine, evidence_workspace
):
    from fastapi import HTTPException
    from sqlalchemy import update
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.services.application_evidence import compare_and_set_application

    _, _, _, payload = evidence_workspace
    stale = await db.get(Application, payload["id"])
    assert stale.evidence_revision == 0
    async with async_sessionmaker(db_engine)() as writer:
        await writer.execute(
            update(Application)
            .where(Application.id == stale.id)
            .values(evidence_revision=1, status_meaning="offer")
        )
        await writer.commit()
    # A caller-supplied newer revision must not bypass the snapshot actually read.
    with pytest.raises(HTTPException) as failure:
        await compare_and_set_application(
            db, stale, {"status_meaning": "rejected"}, expected_revision=1
        )
    assert failure.value.status_code == 409
    await db.refresh(stale)
    assert stale.status_meaning == "offer" and stale.evidence_revision == 1
