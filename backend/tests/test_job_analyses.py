"""Reviewed AI: migrated storage, fake execution, ownership and quote guards."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_workspace_v030 import post
from tests.test_workspace_v030 import workspace as workspace

from app.core.deps import AuthContext
from app.models import Application, JobLead, Round, RoundType, UserProfile
from app.models.job_analysis import JobAnalysis
from app.schemas.ai_settings import AISettingsUpdate
from app.schemas.job_analysis import CATEGORIES, CreateAnalysis, RunAnalysis
from app.services import job_analyses as service
from app.services.ai_settings import update_ai_settings
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService
from app.services.interview_evidence import fingerprint
from app.services.interview_jobs import guard
from app.services.interview_text import validate_section

POSTING = "Junior Python developer. Work remotely. Python and SQL required."


def extraction():
    return {
        "items": [
            {
                "id": "title",
                "field": "title",
                "value": "Python developer",
                "quote": "Junior Python developer",
            },
            {
                "id": "mode",
                "field": "work_mode",
                "value": "remote",
                "quote": "Work remotely",
            },
            {
                "id": "python",
                "field": "must_have",
                "value": "Python",
                "quote": "Python and SQL required",
            },
        ]
    }


async def saved_analysis(db, user, record, kind="EXTRACTION", round_id=None):
    row = await service.create(
        db,
        user.id,
        CreateAnalysis(
            kind=kind,
            lead_id=record.id if isinstance(record, JobLead) else None,
            application_id=record.id if isinstance(record, Application) else None,
            round_id=round_id,
        ),
    )
    data, revisions = await service.inputs(db, row)
    row.fingerprint, row.input_revisions = fingerprint(data), revisions
    row.source_text = data.get("posting", "")
    row.review_state = "ready"
    row.draft = extraction() if kind == "EXTRACTION" else {}
    await db.commit()
    return row


def test_exact_quotes_complete_matrix_and_preparation():
    sources = [{"data": {"posting": POSTING}}]
    assert validate_section(extraction(), sources, "EXTRACTION")["items"]
    bad = extraction()
    bad["items"][0]["quote"] = "Invented source"
    with pytest.raises(ValueError):
        validate_section(bad, sources, "EXTRACTION")
    data = {
        "requirements": [{"id": "r1", "text": "Python"}],
        "profile": [{"id": "p1", "text": "Built a Python service"}],
    }
    sources = [{"data": data}]
    matrix = {
        "rows": [
            {
                "requirement_id": "r1",
                "state": "confirmed",
                "evidence": [{"profile_id": "p1", "quote": "Python service"}],
                "why": "Saved project uses Python",
            }
        ]
    }
    assert validate_section(matrix, sources, "PROFILE_MATCH")
    for invalid in ({"rows": []}, {"rows": [*matrix["rows"], *matrix["rows"]]}):
        with pytest.raises(ValueError):
            validate_section(invalid, sources, "PROFILE_MATCH")
    data["profile"] = []
    with pytest.raises(ValueError):
        validate_section(matrix, sources, "PROFILE_MATCH")
    draft = {category: [] for category in CATEGORIES}
    draft["examples"] = [
        {"id": "e1", "text": "Invented example", "evidence": [], "requirement_ids": []}
    ]
    with pytest.raises(ValueError):
        validate_section(draft, sources, "PREPARATION")
    for kind in service.KINDS:
        prompt = service.prompt(kind)
        assert "Never invent experience" in prompt and "personality" in prompt


async def test_atomic_review_company_choice_revision_and_owner(client, db, workspace):
    user, h, other, oh, _ = workspace
    lead_data = await post(
        client, "/job-leads", {"title": "Saved title", "text": POSTING}, h
    )
    lead = await db.get(JobLead, lead_data["id"])
    row = await saved_analysis(db, user, lead)
    assert (
        await client.get(f"/api/job-analyses/{row.id}", headers=oh)
    ).status_code == 404
    body = {
        "expected_revision": 0,
        "target_revision": lead.revision,
        "items": [
            {"id": "title", "decision": "rejected"},
            {"id": "python", "decision": "accepted"},
            {"id": "mode", "decision": "edited", "value": "hybrid"},
        ],
    }
    response = await client.patch(
        f"/api/job-analyses/{row.id}/review", json=body, headers=h
    )
    assert response.status_code == 200, response.text
    await db.refresh(lead)
    assert lead.title == "Saved title" and lead.work_mode == "hybrid"
    assert lead.confirmed_requirements[0]["text"] == "Python"
    assert lead.requirements_revision == 1
    assert (
        await client.patch(f"/api/job-analyses/{row.id}/review", json=body, headers=h)
    ).status_code == 409
    row = await saved_analysis(db, user, lead)
    row.draft = {
        "items": [{"id": "c", "field": "company", "value": "Python", "quote": "Python"}]
    }
    await db.commit()
    body = {
        "expected_revision": 0,
        "target_revision": lead.revision,
        "items": [{"id": "c", "decision": "accepted"}],
    }
    assert (
        await client.patch(f"/api/job-analyses/{row.id}/review", json=body, headers=h)
    ).status_code == 422
    company = await post(client, "/companies", {"name": "North"}, h)
    body["items"][0]["company_id"] = company["id"]
    assert (
        await client.patch(f"/api/job-analyses/{row.id}/review", json=body, headers=h)
    ).status_code == 200


async def test_executor_intents_stale_inputs_and_no_automatic_publication(
    client, db, db_engine, workspace, monkeypatch
):
    user, h, _, _, _ = workspace
    value = await post(client, "/job-leads", {"title": "Original", "text": POSTING}, h)
    await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_model="openai/fixture",
            litellm_base_url="http://127.0.0.1:1/v1",
            text_keyless=True,
        ),
    )
    await db.commit()
    row = await service.create(
        db, user.id, CreateAnalysis(kind="EXTRACTION", lead_id=value["id"])
    )
    auth = AuthContext(user=user, auth_method="jwt")
    request = RunAnalysis(intent_id=uuid4(), expected_revision=0)
    job = await service.start(db, auth, row, request)
    assert (await service.start(db, auth, row, request)).id == job.id
    job.state, job.claim_id = "analyzing", "claim"
    await db.commit()
    calls = []

    async def fake(settings, sources, limits, scope, **kwargs):
        calls.append(scope)
        return extraction()

    monkeypatch.setattr(service, "analyze_section", fake)
    executor = SimpleNamespace(
        sessions=async_sessionmaker(db_engine, expire_on_commit=False)
    )
    await service.execute(executor, job.id, "claim")
    await db.refresh(row)
    await db.refresh(job)
    lead = await db.get(JobLead, value["id"])
    assert job.state == "complete" and row.draft["items"] and calls == ["EXTRACTION"]
    assert lead.title == "Original" and not lead.confirmed_requirements
    job = await service.start(
        db, auth, row, RunAnalysis(intent_id=uuid4(), expected_revision=row.revision)
    )
    lead.source_text = "Changed source"
    await db.commit()
    with pytest.raises(HTTPException) as failure:
        await guard(db, job.id, None, ("queued",))
    assert failure.value.status_code == 409


async def test_match_permission_stale_counts_and_preparation_append(
    client, db, workspace
):
    user, h, _, _, statuses = workspace
    app_data = await post(
        client,
        "/applications",
        {
            "company": "North",
            "job_title": "Developer",
            "status_id": statuses["applied"],
        },
        h,
    )
    record = await db.get(Application, app_data["id"])
    record.confirmed_requirements = [
        {"id": "r1", "type": "must_have", "text": "Python"}
    ]
    profile = UserProfile(
        user_id=user.id,
        projects=[
            {"id": str(uuid4()), "name": "Ledger", "description": "Python service"}
        ],
    )
    db.add(profile)
    await db.commit()
    row = await saved_analysis(db, user, record, "PROFILE_MATCH")
    row.draft = {
        "rows": [
            {
                "requirement_id": "r1",
                "state": "no_evidence",
                "evidence": [],
                "why": "No supporting detail",
            }
        ]
    }
    await db.commit()
    assert record.id in await service.current_matches(db, user.id, [record])
    result = (
        await client.get("/api/analytics/breakdowns?period=all", headers=h)
    ).json()
    assert result["missing_evidence"]["denominator"] == 1
    round_type = await db.scalar(select(RoundType))
    interview = Round(
        application_id=record.id,
        round_type_id=round_type.id,
        preparation={"plan": ["Keep existing"]},
    )
    db.add(interview)
    await db.commit()
    draft = await saved_analysis(db, user, record, "PREPARATION", interview.id)
    draft.draft = {category: [] for category in CATEGORIES}
    draft.draft = {
        **draft.draft,
        "plan": [
            {
                "id": "plan",
                "text": "Practice Python",
                "requirement_ids": ["r1"],
                "evidence": [],
            }
        ],
    }
    await db.commit()
    body = {"expected_revision": 0, "target_revision": 0, "selected_ids": ["plan"]}
    response = await client.post(
        f"/api/job-analyses/{draft.id}/apply", json=body, headers=h
    )
    assert response.status_code == 200, response.text
    body.update(expected_revision=1, target_revision=1)
    assert (
        await client.post(f"/api/job-analyses/{draft.id}/apply", json=body, headers=h)
    ).status_code == 200
    await db.refresh(interview)
    assert interview.preparation["plan"] == ["Keep existing", "Practice Python"]
    profile.ai_permissions = {"projects": False}
    profile.permission_revision += 1
    await db.commit()
    assert not await service.current_matches(db, user.id, [record])
    assert (await service.view(db, row))["draft"] == {}


async def test_archive_inert_and_compatibility_path(client, db, workspace):
    user, h, other, _, statuses = workspace
    await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_model="openai/fixture",
            litellm_base_url="http://127.0.0.1:1/v1",
            text_keyless=True,
        ),
    )
    await db.commit()
    response = await client.post(
        "/api/applications/extract",
        json={"text": POSTING, "status_id": statuses["applied"]},
        headers=h,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"]["meaning"] == "preparing" and body["pending_analysis_id"]
    assert not body["requirements_must_have"] and body["source_text"] == POSTING
    row = await db.get(JobAnalysis, body["pending_analysis_id"])
    row.draft = extraction()
    row.review_state = "ready"
    await db.commit()
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            user.id, session
        )
    )
    assert len(archive["models"]["JobAnalysis"]) == 1
    assert "InterviewJob" not in archive["models"]
    mapper = IDMapper()
    await db.run_sync(
        lambda session: ImportService(default_registry, mapper).import_user_data(
            archive, other.id, session
        )
    )
    await db.commit()
    restored = await db.scalar(
        select(JobAnalysis).where(JobAnalysis.user_id == other.id)
    )
    assert restored.application_id != row.application_id
    assert restored.review_state == "imported" and not restored.fingerprint
    assert restored.draft == extraction()
