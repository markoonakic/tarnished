"""Automatic publication uses the same owner-scoped review transaction."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_job_analyses import extraction
from tests.test_workspace_v030 import post
from tests.test_workspace_v030 import workspace as workspace

from app.core.deps import AuthContext
from app.models import Application, InterviewJob, JobLead
from app.models.job_analysis import JobAnalysis
from app.models.workspace import Company
from app.schemas.ai_settings import AISettingsUpdate
from app.schemas.job_analysis import CreateAnalysis, RunAnalysis
from app.services import job_analyses as service
from app.services.ai_settings import update_ai_settings

POSTING = "North needs a Junior Python developer. Work remotely. Python and SQL required. Build services."


@pytest.mark.parametrize("existing", [False, True])
@pytest.mark.parametrize("entry", ["analysis", "lead_extract", "application_extract"])
async def test_auto_apply_company_requirements_and_owner(
    client, db, db_engine, workspace, monkeypatch, existing, entry
):
    user, headers, other, other_headers, statuses = workspace
    foreign = await post(client, "/companies", {"name": "North"}, other_headers)
    matched = (
        await post(client, "/companies", {"name": " north "}, headers)
        if existing
        else None
    )
    # Another user's preference cannot disable this user's automatic publication.
    other.settings = {"review_ai_extraction": True}
    await db.commit()
    lead_data = await post(
        client, "/job-leads", {"title": "Original", "text": POSTING}, headers
    )
    await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_model="openai/fixture",
            litellm_base_url="http://127.0.0.1:1/v1",
            text_keyless=True,
        ),
    )
    if entry == "analysis":
        row = await service.create(
            db, user.id, CreateAnalysis(kind="EXTRACTION", lead_id=lead_data["id"])
        )
        job = await service.start(
            db,
            AuthContext(user=user, auth_method="jwt"),
            row,
            RunAnalysis(intent_id=uuid4(), expected_revision=0),
        )
    else:
        await db.commit()
        if entry == "lead_extract":
            response = await client.post(
                f"/api/job-leads/{lead_data['id']}/extract",
                headers=headers,
                json={"expected_revision": lead_data["revision"]},
            )
        else:
            response = await client.post(
                "/api/applications/extract",
                headers=headers,
                json={"text": POSTING, "status_id": statuses["applied"]},
            )
        assert response.status_code in (200, 201), response.text
        lead_data = response.json()
        row = await db.get(JobAnalysis, lead_data["pending_analysis_id"])
        job = await db.scalar(
            select(InterviewJob).where(
                InterviewJob.analysis_id == row.id, InterviewJob.user_id == user.id
            )
        )
    job.state, job.claim_id = "analyzing", "claim"
    await db.commit()
    output = extraction()
    output["items"] += [
        {"id": "company", "field": "company", "value": " NORTH ", "quote": "North"},
        {
            "id": "responsibilities",
            "field": "responsibilities",
            "value": "Build services",
            "quote": "Build services",
        },
    ]

    async def fake(*args, **kwargs):
        return output

    # Switching on after dispatch does not change an existing automatic run.
    user.settings = {"review_ai_extraction": True}
    await db.commit()
    monkeypatch.setattr(service, "analyze_section", fake)
    await service.execute(
        SimpleNamespace(sessions=async_sessionmaker(db_engine, expire_on_commit=False)),
        job.id,
        "claim",
    )
    await db.refresh(row)
    lead = await db.get(
        Application if entry == "application_extract" else JobLead, lead_data["id"]
    )
    await db.refresh(lead)
    assert row.review_state == "saved" and len(row.reviewed) == 5
    assert all(item["decision"] == "accepted" for item in row.reviewed)
    if isinstance(lead, JobLead):
        assert lead.title == "Python developer" and lead.description == "Build services"
        assert lead.status == "extracted"
    else:
        assert (
            lead.job_title == "Python developer"
            and lead.job_description == "Build services"
        )
    assert lead.work_mode == "remote"
    assert lead.confirmed_requirements[0]["review_state"] == "accepted"
    assert lead.confirmed_requirements[0]["quote"] == "Python and SQL required"
    assert lead.requirements_must_have == ["Python"] and lead.requirements_revision == 1
    assert lead.company_id != foreign["id"]
    companies = list(
        await db.scalars(select(Company).where(Company.user_id == user.id))
    )
    assert len(companies) == 1 and companies[0].id == lead.company_id
    if matched:
        assert lead.company_id == matched["id"]
    else:
        assert companies[0].name == "NORTH"
    # Confirmed requirements are immediately available to comparisons and preparation.
    data, _ = service.comparison_inputs(lead, None)
    assert data["requirements"] == lead.confirmed_requirements
    response = await client.patch(
        "/api/user-preferences", headers=headers, json={"review_ai_extraction": True}
    )
    assert response.status_code == 200
    await db.refresh(row)
    assert row.review_state == "saved"  # Switching never changes existing analyses.
    assert (
        await client.get(f"/api/job-analyses/{row.id}", headers=other_headers)
    ).status_code == 404


@pytest.mark.parametrize("conflict", ["target", "posting", "pay"])
async def test_auto_apply_conflict_keeps_all_proposals_without_partial_writes(
    client, db, db_engine, workspace, monkeypatch, conflict
):
    user, headers, _, _, _ = workspace
    lead_data = await post(
        client, "/job-leads", {"title": "Original", "text": POSTING}, headers
    )
    await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_model="openai/fixture",
            litellm_base_url="http://127.0.0.1:1/v1",
            text_keyless=True,
        ),
    )
    row = await service.create(
        db, user.id, CreateAnalysis(kind="EXTRACTION", lead_id=lead_data["id"])
    )
    job = await service.start(
        db,
        AuthContext(user=user, auth_method="jwt"),
        row,
        RunAnalysis(intent_id=uuid4(), expected_revision=0),
    )
    job.state, job.claim_id = "analyzing", "claim"
    await db.commit()
    output = extraction()
    output["items"].append(
        {"id": "company", "field": "company", "value": "North", "quote": "North"}
    )

    async def fake(*args, **kwargs):
        if conflict != "pay":
            lead = await db.get(JobLead, lead_data["id"])
            lead.revision += 1
            if conflict == "posting":
                lead.source_text = "Changed posting"
            await db.commit()
        else:
            output["items"] += [
                {"id": "min", "field": "salary_min", "value": 200, "quote": "North"},
                {"id": "max", "field": "salary_max", "value": 100, "quote": "North"},
            ]
        return output

    monkeypatch.setattr(service, "analyze_section", fake)
    await service.execute(
        SimpleNamespace(sessions=async_sessionmaker(db_engine, expire_on_commit=False)),
        job.id,
        "claim",
    )
    await db.refresh(row)
    await db.refresh(job)
    lead = await db.get(JobLead, lead_data["id"])
    await db.refresh(lead)
    assert job.state == "complete" and row.review_state == "ready"
    assert row.draft == output and not row.reviewed
    assert (
        lead.title == "Original"
        and not lead.confirmed_requirements
        and not lead.company_id
    )
    assert not list(await db.scalars(select(Company).where(Company.user_id == user.id)))
