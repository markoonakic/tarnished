"""Lead capture and extraction through the API."""

import asyncio
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api import job_leads
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    JobLead,
    User,
)
from app.schemas.job_lead import JobLeadExtractionInput
from app.services.ai_settings import AISettingsState
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import import_payload_data


@pytest.fixture
async def capture_workspace(client, db, db_engine, monkeypatch):
    owner = User(email="capture@synthetic.test", password_hash="unused")
    other = User(email="other-capture@synthetic.test", password_hash="unused")
    db.add_all([owner, other])
    await db.flush()
    db.add(ApplicationStatus(name="Applied", meaning="applied", user_id=owner.id))
    await db.commit()
    client.headers["Authorization"] = "Bearer " + create_access_token(
        {"sub": owner.id, "session_version": owner.session_version}
    )
    # Real concurrent requests must not share the test suite's single session.
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def get_session():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = get_session
    ai = AsyncMock(
        return_value=AISettingsState(
            model="synthetic", api_key="synthetic", base_url=None
        )
    )
    fetch = AsyncMock(side_effect=AssertionError("Unapproved network fetch"))
    extract = AsyncMock(side_effect=AssertionError("Unapproved provider call"))
    monkeypatch.setattr(job_leads, "get_ai_settings", ai)
    monkeypatch.setattr(job_leads, "fetch_job_posting_html", fetch)
    monkeypatch.setattr(job_leads, "extract_job_data", extract)
    return SimpleNamespace(
        owner=owner, other=other, ai=ai, fetch=fetch, extract=extract
    )


async def save(client, **kwargs):
    result = await client.post(
        "/api/job-leads", json={"url": "https://jobs.example/one", **kwargs}
    )
    assert result.status_code == 201, result.text
    return result.json()


async def test_plain_save_without_ai_source_bounds_and_partial_failure(
    client, capture_workspace, monkeypatch
):
    workspace = capture_workspace
    lead = await save(client)
    assert lead["id"] and lead["status"] == "pending" and lead["revision"] == 0
    assert lead["source_text"] is None and "No useful source" in lead["content_warning"]
    lead = await save(
        client, url="https://jobs.example/text", text="useful text " * 8000
    )
    assert len(lead["source_text"]) <= 50_000 and lead["source_truncated"]
    assert "partial" in lead["content_warning"] and lead["source"] is None
    lead = await save(
        client,
        url="https://jobs.example/html",
        html="<article><h1>Engineer</h1><p>Useful posting.</p></article>"
        + " " * 110_000,
    )
    assert "Engineer" in lead["source_text"] and lead["source_truncated"]
    lead = await save(
        client,
        url="https://jobs.example/prefer",
        text="Plain supplied",
        html="<p>Other</p>",
    )
    assert lead["source_text"] == "Plain supplied"
    monkeypatch.setattr("app.services.lead_capture.preprocess_html", lambda _: 1 / 0)
    lead = await save(client, url="https://jobs.example/bad", html="<p>Broken</p>")
    assert (
        lead["id"]
        and lead["source_text"] is None
        and "failed" in lead["content_warning"]
    )
    too_large = await client.post(
        "/api/job-leads",
        json={"url": "https://jobs.example/large", "text": "x" * 100_001},
    )
    assert too_large.status_code == 422
    workspace.ai.assert_not_awaited()
    workspace.fetch.assert_not_awaited()
    workspace.extract.assert_not_awaited()


@pytest.mark.parametrize(
    ("text", "expected", "truncated"),
    [
        ("Engineer\x00Company", "Engineer Company", False),
        ("\x00", None, False),
        ("Useful source " * 5000 + "\x00", None, True),
    ],
)
async def test_nul_source_saves_identity_with_honest_warning(
    client, capture_workspace, text, expected, truncated
):
    lead = await save(client, text=text)
    assert lead["id"] and lead["url"] == "https://jobs.example/one"
    assert lead["status"] == "pending" and lead["revision"] == 0
    assert "NUL characters" in lead["content_warning"]
    assert lead["source_truncated"] is truncated
    if truncated:
        assert len(lead["source_text"]) <= 50_000
        assert "partial" in lead["content_warning"]
    else:
        assert lead["source_text"] == expected
        if expected is None:
            assert "No useful source" in lead["content_warning"]
    assert "\x00" not in (lead["source_text"] or "")
    assert (await client.get("/api/job-leads/" + lead["id"])).json() == lead
    capture_workspace.ai.assert_not_awaited()
    capture_workspace.fetch.assert_not_awaited()
    capture_workspace.extract.assert_not_awaited()


@pytest.mark.parametrize(
    "field",
    [
        "title",
        "company",
        "description",
        "location",
        "salary_currency",
        "recruiter_name",
        "recruiter_title",
        "recruiter_linkedin_url",
        "source",
    ],
)
async def test_nul_scalar_rejected_before_edit_or_extraction_publication(
    client, capture_workspace, field
):
    lead = await save(client, text="Retained source")
    path = "/api/job-leads/" + lead["id"]
    invalid = {field: "Bad\x00text"}
    response = await client.patch(path, json={"expected_revision": 0, **invalid})
    assert response.status_code == 422, response.text
    assert (await client.get(path)).json() == lead
    capture_workspace.extract.side_effect = None
    capture_workspace.extract.return_value = JobLeadExtractionInput.model_validate(
        invalid
    )
    response = await client.post(path + "/extract", json={"expected_revision": 0})
    assert response.status_code == 400, response.text
    assert response.json()["detail"]["id"] == lead["id"]
    current = (await client.get(path)).json()
    assert current["id"] == lead["id"] and current["url"] == lead["url"]
    assert current["source_text"] == "Retained source" and current[field] is None
    assert current["status"] == "failed" and current["revision"] == 2
    assert current["processing_started_at"] is None
    capture_workspace.extract.return_value = JobLeadExtractionInput.model_validate(
        {field: "Valid"}
    )
    retry = await client.post(path + "/retry")
    assert retry.status_code == 200, retry.text
    assert retry.json()[field] == "Valid" and retry.json()["revision"] == 4
    assert retry.json()["processing_started_at"] is None
    capture_workspace.fetch.assert_not_awaited()


async def test_failed_extraction_retains_identity_fetched_source_and_manual_intent(
    client, capture_workspace
):
    from app.services.extraction import ExtractionAuthError

    workspace = capture_workspace
    lead = await save(client)
    path = "/api/job-leads/" + lead["id"]
    edit = await client.patch(
        path,
        json={
            "expected_revision": 0,
            "title": "Corrected",
            "company": "Manual",
            "location": None,
            "skills": [],
        },
    )
    assert edit.status_code == 200, edit.text
    workspace.fetch.side_effect = None
    workspace.fetch.return_value = (
        "<article><p>Useful source fetched before AI fails</p></article>"
    )
    workspace.extract.side_effect = ExtractionAuthError("No key")
    failed = await client.post(path + "/extract", json={"expected_revision": 1})
    assert failed.status_code == 502 and failed.json()["detail"]["id"] == lead["id"]
    current = (await client.get(path)).json()
    assert current["status"] == "failed" and current["processing_started_at"] is None
    assert "Useful source" in current["source_text"] and current["title"] == "Corrected"
    workspace.extract.side_effect = None
    workspace.extract.return_value = JobLeadExtractionInput.model_validate(
        {
            "title": "AI title",
            "company": "AI company",
            "location": "AI location",
            "skills": ["AI skill"],
            "description": "AI description",
        }
    )
    result = await client.post(path + "/retry")
    assert result.status_code == 200, result.text
    current = result.json()
    assert (
        current["title"],
        current["company"],
        current["location"],
        current["skills"],
    ) == ("Corrected", "Manual", None, [])
    assert current["description"] == "AI description"
    workspace.fetch.assert_awaited_once()
    assert workspace.extract.await_args.kwargs["retry_invalid_response"] is False
    assert workspace.extract.await_args.kwargs["text"] == current["source_text"]


async def test_manual_patch_merged_validation_omission_null_and_internal_denials(
    client, capture_workspace
):
    lead = await save(client, text="Source")
    path = "/api/job-leads/" + lead["id"]
    response = await client.patch(
        path,
        json={
            "expected_revision": 0,
            "salary_min": 100,
            "salary_max": 200,
            "title": "First",
        },
    )
    assert response.status_code == 200, response.text
    for data in [
        {"salary_min": 300},
        {"salary_max": 50},
        {"skills": None},
        {"company": "x" * 256},
        {"salary_min": -1},
        {"user_id": capture_workspace.other.id},
        {"status": "extracted"},
        {"source_text": "Override"},
        {"manual_fields": []},
        {"converted_to_application_id": "foreign"},
        {},
    ]:
        response = await client.patch(path, json={"expected_revision": 1, **data})
        assert response.status_code == 422, (data, response.text)
    assert (
        await client.patch(path, json={"title": "missing revision"})
    ).status_code == 422
    assert (
        await client.patch(path, json={"expected_revision": 0, "title": "stale"})
    ).status_code == 409
    current = (
        await client.patch(path, json={"expected_revision": 1, "salary_max": None})
    ).json()
    assert (
        current["salary_min"] == 100
        and current["salary_max"] is None
        and current["title"] == "First"
    )
    assert current["revision"] == 2 and "salary_max" in current["manual_fields"]


@pytest.mark.parametrize("mutation", ["edit", "delete"])
@pytest.mark.parametrize("failure", [False, True])
async def test_manual_edit_or_deletion_during_extraction_discards_late_outcome(
    client, capture_workspace, mutation, failure
):
    lead = await save(client, text="Source")
    path = "/api/job-leads/" + lead["id"]
    entered, release = asyncio.Event(), asyncio.Event()

    async def extract(**kwargs):
        entered.set()
        await release.wait()
        if failure:
            raise ValueError("Late failure")
        return JobLeadExtractionInput.model_validate(
            {"title": "Late title", "company": "Late company"}
        )

    capture_workspace.extract.side_effect = extract
    task = asyncio.create_task(
        client.post(path + "/extract", json={"expected_revision": 0})
    )
    await asyncio.wait_for(entered.wait(), 10)
    current = (await client.get(path)).json()
    assert current["status"] == "processing" and current["revision"] == 1
    if mutation == "edit":
        response = await client.patch(
            path, json={"expected_revision": 1, "title": "Human"}
        )
        assert response.status_code == 200, response.text
        assert (
            response.json()["status"] == "pending"
            and response.json()["processing_started_at"] is None
        )
    else:
        assert (await client.delete(path)).status_code == 204
    release.set()
    assert (await asyncio.wait_for(task, 10)).status_code == 409
    current = await client.get(path)
    if mutation == "delete":
        assert current.status_code == 404
    else:
        assert (
            current.json()["title"] == "Human" and current.json()["status"] == "pending"
        )


@pytest.mark.parametrize("old_failure", [False, True])
@pytest.mark.parametrize("new_finishes_first", [False, True])
async def test_explicit_replacement_under_frozen_clock_rejects_old_outcomes(
    client, capture_workspace, monkeypatch, old_failure, new_finishes_first
):
    class FrozenDatetime:
        @staticmethod
        def now(tz):
            return datetime(2026, 1, 1, tzinfo=UTC)

    monkeypatch.setattr(job_leads, "datetime", FrozenDatetime)
    lead = await save(client, text="Source")
    path = "/api/job-leads/" + lead["id"]
    entered = [asyncio.Event(), asyncio.Event()]
    release = [asyncio.Event(), asyncio.Event()]
    calls = 0

    async def extract(**kwargs):
        nonlocal calls
        index = calls
        calls += 1
        entered[index].set()
        await release[index].wait()
        if index == 0 and old_failure:
            raise ValueError("Old failure")
        return JobLeadExtractionInput.model_validate(
            {"title": "Old" if index == 0 else "New", "company": "Company"}
        )

    capture_workspace.extract.side_effect = extract
    old = asyncio.create_task(
        client.post(path + "/extract", json={"expected_revision": 0})
    )
    await asyncio.wait_for(entered[0].wait(), 10)
    first = (await client.get(path)).json()
    denied = await client.post(path + "/retry", json={"expected_revision": 1})
    assert denied.status_code == 409 and "billed" in denied.json()["detail"]["message"]
    assert (
        await client.post(
            path + "/retry", json={"expected_revision": 0, "restart_processing": True}
        )
    ).status_code == 409
    new = asyncio.create_task(
        client.post(
            path + "/retry", json={"expected_revision": 1, "restart_processing": True}
        )
    )
    await asyncio.wait_for(entered[1].wait(), 10)
    second = (await client.get(path)).json()
    assert second["processing_started_at"] == first["processing_started_at"]
    assert second["revision"] == 2 and "uncertain" in second["error_message"]
    if new_finishes_first:
        release[1].set()
        result = await asyncio.wait_for(new, 10)
        second = result.json()
    release[0].set()
    assert (await asyncio.wait_for(old, 10)).status_code == 409
    assert (await client.get(path)).json() == second
    if not new_finishes_first:
        release[1].set()
        result = await asyncio.wait_for(new, 10)
    assert result.status_code == 200 and result.json()["title"] == "New"
    assert (
        result.json()["revision"] == 3
        and result.json()["processing_started_at"] is None
    )


async def test_saved_interrupted_claim_survives_new_request_and_explicit_restart(
    client, db, capture_workspace
):
    lead = await save(client, text="Source")
    await db.execute(
        update(JobLead)
        .where(JobLead.id == lead["id"])
        .values(
            status="processing",
            revision=7,
            processing_started_at=datetime(2020, 1, 1, tzinfo=UTC),
        )
    )
    await db.commit()
    path = "/api/job-leads/" + lead["id"]
    # A new HTTP client/session has no in-memory task, but persistence is truthful.
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers=client.headers
    ) as fresh:
        assert (await fresh.get(path)).json()["status"] == "processing"
        assert (await fresh.post(path + "/retry")).status_code == 400
        capture_workspace.extract.side_effect = None
        capture_workspace.extract.return_value = JobLeadExtractionInput.model_validate(
            {"title": "Restarted"}
        )
        result = await fresh.post(
            path + "/extract", json={"expected_revision": 7, "restart_processing": True}
        )
        assert result.status_code == 200 and result.json()["revision"] == 9


async def test_duplicate_race_returns_owned_identity(
    client, db, capture_workspace, monkeypatch
):
    barrier = asyncio.Barrier(2)
    original = job_leads._duplicate
    calls = 0

    async def synchronized(*args):
        nonlocal calls
        calls += 1
        initial = calls <= 2
        await original(*args)
        if initial:
            await barrier.wait()

    monkeypatch.setattr(job_leads, "_duplicate", synchronized)
    results = await asyncio.wait_for(
        asyncio.gather(
            *[
                client.post(
                    "/api/job-leads",
                    json={"url": "https://jobs.example/race", "text": "Source"},
                )
                for _ in range(2)
            ]
        ),
        15,
    )
    assert sorted(r.status_code for r in results) == [201, 409], [
        r.text for r in results
    ]
    winner = next(r.json() for r in results if r.status_code == 201)
    assert (
        next(r.json()["detail"]["id"] for r in results if r.status_code == 409)
        == winner["id"]
    )
    again = await client.post("/api/job-leads", json={"url": winner["url"]})
    assert again.json()["detail"]["id"] == winner["id"]
    assert await db.scalar(select(func.count()).select_from(JobLead)) == 1


async def test_manual_conversion_race_is_atomic_and_repeat_checks_owned_result_first(
    client, db, capture_workspace, monkeypatch
):
    lead = await save(client, text="Source")
    path = "/api/job-leads/" + lead["id"]
    edit = await client.patch(
        path,
        json={
            "expected_revision": 0,
            "company": "Manual company",
            "title": "Manual title",
        },
    )
    assert edit.status_code == 200
    barrier = asyncio.Barrier(2)
    original = job_leads.get_initial_application_status

    async def synchronized(*args):
        result = await original(*args)
        await barrier.wait()
        return result

    monkeypatch.setattr(job_leads, "get_initial_application_status", synchronized)
    results = await asyncio.wait_for(
        asyncio.gather(client.post(path + "/convert"), client.post(path + "/convert")),
        15,
    )
    assert [r.status_code for r in results] == [201, 201], [r.text for r in results]
    assert results[0].json()["id"] == results[1].json()["id"]
    assert await db.scalar(select(func.count()).select_from(Application)) == 1
    assert (
        await db.scalar(select(func.count()).select_from(ApplicationStatusHistory)) == 1
    )
    result = results[0].json()
    assert (
        result["status_meaning"] == "applied"
        and result["response_state"] == "not_recorded"
    )
    history = await db.scalar(select(ApplicationStatusHistory))
    assert history.to_meaning == "applied" and history.time_provenance == "recorded"
    # Corrupted/incomplete source must not reject an already established result.
    await db.execute(
        update(JobLead)
        .where(JobLead.id == lead["id"])
        .values(status="failed", title=None, company=None)
    )
    await db.commit()
    repeated = await client.post(path + "/convert")
    assert repeated.status_code == 201 and repeated.json()["id"] == result["id"]
    # A foreign result link is not an owned idempotent response.
    await db.execute(
        update(Application)
        .where(Application.id == result["id"])
        .values(user_id=capture_workspace.other.id)
    )
    await db.commit()
    assert (await client.post(path + "/convert")).status_code == 409


async def test_owner_and_scope_denials_do_not_call_provider(
    client, db, capture_workspace
):
    from app.core.security import hash_api_key
    from app.models import UserAPIKey

    lead = await save(client, text="Source")
    path = "/api/job-leads/" + lead["id"]
    other = capture_workspace.other
    headers = {
        "Authorization": "Bearer "
        + create_access_token(
            {"sub": other.id, "session_version": other.session_version}
        )
    }
    for method, suffix, data in [
        ("get", "", None),
        ("patch", "", {"expected_revision": 0, "title": "Foreign"}),
        ("post", "/extract", {"expected_revision": 0}),
        ("post", "/retry", None),
        ("post", "/convert", None),
        ("delete", "", None),
    ]:
        response = await client.request(
            method, path + suffix, headers=headers, json=data
        )
        assert response.status_code == 404, response.text
    other_save = await client.post(
        "/api/job-leads", headers=headers, json={"url": lead["url"]}
    )
    assert other_save.status_code == 201 and other_save.json()["id"] != lead["id"]
    token = "tn_test_capture_scope_key"
    db.add(
        UserAPIKey(
            user_id=capture_workspace.owner.id,
            label="Read only",
            key_prefix=token[:8],
            key_hash=hash_api_key(token),
            scopes=["job_leads:read"],
        )
    )
    await db.commit()
    client.headers.pop("Authorization")
    client.headers["X-API-Key"] = token
    assert (await client.get(path)).status_code == 200
    for method, suffix, data in [
        ("patch", "", {"expected_revision": 0, "title": "Denied"}),
        ("post", "/extract", {"expected_revision": 0}),
        ("post", "/retry", None),
        ("post", "/convert", None),
        ("delete", "", None),
    ]:
        assert (
            await client.request(method, path + suffix, json=data)
        ).status_code == 403
    capture_workspace.extract.assert_not_awaited()


async def test_capture_archive_roundtrip_legacy_defaults_and_no_live_claim(
    client, db, capture_workspace
):
    lead = await save(client, text="Retained source " * 6000)
    path = "/api/job-leads/" + lead["id"]
    assert (
        await client.patch(
            path, json={"expected_revision": 0, "title": None, "company": "Human"}
        )
    ).status_code == 200
    await db.execute(
        update(JobLead)
        .where(JobLead.id == lead["id"])
        .values(
            status="processing", processing_started_at=datetime.now(UTC), revision=2
        )
    )
    await db.commit()

    async def export(owner_id):
        return await db.run_sync(
            lambda session: ExportService(default_registry).export_user_data(
                owner_id, session
            )
        )

    archive = await export(capture_workspace.owner.id)
    row = archive["models"]["JobLead"][0]
    assert "processing_started_at" not in row
    await import_payload_data(
        db, capture_workspace.other.id, archive, {}, lambda **kwargs: None
    )
    await db.commit()
    imported = (await export(capture_workspace.other.id))["models"]["JobLead"][0]
    for field in [
        "source_text",
        "source_truncated",
        "content_warning",
        "revision",
        "manual_fields",
        "title",
        "company",
    ]:
        assert imported[field] == row[field]
    assert (
        imported["status"] == "pending"
        and "No work is running" in imported["error_message"]
    )
    restored = await db.scalar(
        select(JobLead).where(JobLead.user_id == capture_workspace.other.id)
    )
    assert restored.processing_started_at is None
    legacy_owner = User(email="legacy-capture@synthetic.test", password_hash="unused")
    db.add(legacy_owner)
    await db.commit()
    legacy = deepcopy(archive)
    row = legacy["models"]["JobLead"][0]
    for field in [
        "source_text",
        "source_truncated",
        "content_warning",
        "revision",
        "manual_fields",
    ]:
        row.pop(field)
    await import_payload_data(db, legacy_owner.id, legacy, {}, lambda **kwargs: None)
    await db.commit()
    restored = await db.scalar(
        select(JobLead).where(JobLead.user_id == legacy_owner.id)
    )
    assert (
        restored.source_text is None
        and restored.revision == 0
        and restored.manual_fields == []
    )
    assert restored.processing_started_at is None and restored.status == "pending"
    invalid = deepcopy(archive)
    invalid["models"]["JobLead"][0]["manual_fields"] = ["user_id"]
    from app.services.import_id_mapper import IDMapper
    from app.services.import_service import ImportService

    assert not ImportService(default_registry, IDMapper()).validate_export_data(
        invalid
    )[0]


def test_lead_path_disables_repair_and_adapter_retries(monkeypatch):
    from app.services import extraction

    calls = []

    def completion(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="invalid json"))]
        )

    monkeypatch.setattr(extraction, "completion", completion)
    with pytest.raises(extraction.ExtractionInvalidResponseError):
        extraction.extract_with_llm(
            "source",
            "https://jobs.example/one",
            api_key="synthetic-not-live",
            retry_invalid_response=False,
        )
    assert len(calls) == 1 and calls[0]["num_retries"] == calls[0]["max_retries"] == 0


async def test_actual_unconfigured_extraction_never_calls_completion(
    client, capture_workspace, monkeypatch
):
    from unittest.mock import Mock

    from app.services import extraction

    completion = Mock(side_effect=AssertionError("No provider calls allowed"))
    monkeypatch.setattr(extraction, "completion", completion)
    capture_workspace.ai.return_value = AISettingsState(
        model="synthetic", api_key=None, base_url=None
    )
    monkeypatch.setattr(job_leads, "extract_job_data", extraction.extract_job_data)
    lead = await save(client, text="Useful source")
    path = "/api/job-leads/" + lead["id"]
    response = await client.post(path + "/extract", json={"expected_revision": 0})
    assert (
        response.status_code == 502
        and response.json()["detail"]["code"] == "AI_KEY_NOT_CONFIGURED"
    )
    current = (await client.get(path)).json()
    assert current["id"] == lead["id"] and current["source_text"] == "Useful source"
    assert current["status"] == "failed" and current["processing_started_at"] is None
    completion.assert_not_called()


async def test_conversion_failure_rolls_back_application_history_and_claim(
    client, db, capture_workspace, monkeypatch
):
    lead = await save(client)
    path = "/api/job-leads/" + lead["id"]
    assert (
        await client.patch(
            path, json={"expected_revision": 0, "title": "Title", "company": "Company"}
        )
    ).status_code == 200

    def fail(*args):
        raise RuntimeError("Synthetic history failure")

    monkeypatch.setattr("app.services.application_evidence.initial_evidence", fail)
    with pytest.raises(RuntimeError, match="Synthetic history failure"):
        await client.post(path + "/convert")
    assert await db.scalar(select(func.count()).select_from(Application)) == 0
    assert (
        await db.scalar(select(func.count()).select_from(ApplicationStatusHistory)) == 0
    )
    current = (await client.get(path)).json()
    assert current["status"] == "pending" and current["revision"] == 1
    assert current["converted_to_application_id"] is None


async def test_concurrent_manual_edits_have_one_winner(
    client, capture_workspace, monkeypatch
):
    lead = await save(client, text="Source")
    path = "/api/job-leads/" + lead["id"]
    barrier = asyncio.Barrier(2)
    original = job_leads._owned_lead

    async def synchronized(*args):
        result = await original(*args)
        await barrier.wait()
        return result

    monkeypatch.setattr(job_leads, "_owned_lead", synchronized)
    results = await asyncio.wait_for(
        asyncio.gather(
            *[
                client.patch(path, json={"expected_revision": 0, "title": title})
                for title in ["One", "Two"]
            ]
        ),
        15,
    )
    assert sorted(r.status_code for r in results) == [200, 409]
    current = (await client.get(path)).json()
    assert current["revision"] == 1 and current["title"] == next(
        r.json()["title"] for r in results if r.status_code == 200
    )
