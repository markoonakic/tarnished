"""Extraction only invalidates reports that use the changed record's evidence."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_job_analyses import POSTING, extraction, saved_analysis
from tests.test_workspace_v030 import post
from tests.test_workspace_v030 import workspace as workspace

from app.core.deps import AuthContext
from app.models import Application, InterviewJob, JobLead, Round, RoundType, UserProfile
from app.schemas.ai_settings import AISettingsUpdate
from app.schemas.job_analysis import RunAnalysis
from app.services import job_analyses as service
from app.services.ai_settings import get_ai_settings, update_ai_settings
from app.services.interview_evidence import (
    application_snapshot,
    pipeline_snapshot,
    snapshot,
)
from app.services.interview_text import prompt_revision


@pytest.fixture
async def reports(client, db, workspace):
    user, headers, _, _, statuses = workspace
    db.add(
        UserProfile(
            user_id=user.id,
            work_history=[
                {
                    "id": str(uuid4()),
                    "company": "North",
                    "title": "Developer",
                    "description": "Built Python services",
                    "current": True,
                }
            ],
            projects=[
                {
                    "id": str(uuid4()),
                    "name": "Ledger",
                    "description": "Python service",
                }
            ],
        )
    )
    applications, rounds = [], []
    round_type = await db.scalar(select(RoundType))
    for company in ("North", "South"):
        value = await post(
            client,
            "/applications",
            {
                "company": company,
                "job_title": "Developer",
                "status_id": statuses["applied"],
            },
            headers,
        )
        application = await db.get(Application, value["id"])
        application.source_text = POSTING
        application.requirements_must_have = ["Python"]
        interview = Round(application_id=application.id, round_type_id=round_type.id)
        db.add(interview)
        applications.append(application)
        rounds.append(interview)
    await db.commit()
    config = (await get_ai_settings(db)).revision
    jobs = []
    for scope, targets in (
        ("INTERVIEW", rounds),
        ("APPLICATION", applications),
        ("PIPELINE", [user]),
    ):
        for record in targets:
            if scope == "INTERVIEW":
                _, digest = await snapshot(db, user.id, record.id)
                target = {"round_id": record.id}
            elif scope == "APPLICATION":
                _, digest = await application_snapshot(db, user.id, record.id)
                target = {"application_id": record.id}
            else:
                instant = datetime.now(UTC)
                _, digest = await pipeline_snapshot(db, user.id, "all", instant, "UTC")
                target = {}
            report = {
                "scope": scope,
                "fingerprint": digest,
                "config_revision": config,
                "prompt_revision": prompt_revision(scope),
                "findings": [],
            }
            if scope == "INTERVIEW":
                record.interview_report = report
            elif scope == "APPLICATION":
                record.report = report
            else:
                record.pipeline_report = {
                    **report,
                    "period": "all",
                    "as_of": instant.isoformat(),
                    "time_zone": "UTC",
                }
            job = InterviewJob(
                user_id=user.id,
                scope=scope,
                intent_id=str(uuid4()),
                generation=0,
                fingerprint=digest,
                manifest={"retained": True},
                config_revision=config,
                provider="openai",
                model="fixture",
                session_version=user.session_version,
                required_scopes=[],
                state="complete",
                **target,
            )
            db.add(job)
            jobs.append(job)
    await db.commit()
    paths = [
        *(f"/api/applications/{item.id}/feedback" for item in applications),
        *(f"/api/rounds/{item.id}/interview-feedback" for item in rounds),
        "/api/analytics/feedback?period=all",
    ]
    before = [(await client.get(path, headers=headers)).json() for path in paths]
    assert all(state["report"] and not state["stale_reason"] for state in before)
    return user, headers, applications, rounds, jobs, paths, before


@pytest.mark.parametrize("target", ["lead", "converted_lead", "application"])
@pytest.mark.parametrize(
    "operation", ["review", "automatic", "confirm", "non_report_field"]
)
async def test_extraction_keeps_unrelated_saved_feedback(
    client, db, db_engine, reports, monkeypatch, target, operation
):
    user, headers, applications, rounds, jobs, paths, before = reports
    if target == "application":
        record = applications[0]
    else:
        value = await post(
            client, "/job-leads", {"title": "Saved title", "text": POSTING}, headers
        )
        record = await db.get(JobLead, value["id"])
        record.requirements_must_have = ["Python"]
        if target == "converted_lead":
            record.converted_to_application_id = applications[0].id
            applications[0].job_lead_id = record.id
    await db.commit()
    if operation == "confirm":
        response = await client.post(
            "/api/job-analyses/confirm-requirements",
            headers=headers,
            json={
                "application_id" if target == "application" else "lead_id": record.id,
                "expected_revision": service.target_revision(record),
            },
        )
    elif operation == "automatic":
        await update_ai_settings(
            db,
            AISettingsUpdate(
                litellm_model="openai/fixture",
                litellm_base_url="http://127.0.0.1:1/v1",
                text_keyless=True,
            ),
        )
        user.settings = {"review_ai_extraction": False}
        await db.commit()
        # Pin this configuration in the saved reports, so extraction is the only change.
        config = (await get_ai_settings(db)).revision
        for application in applications:
            application.report = {**application.report, "config_revision": config}
        for interview in rounds:
            interview.interview_report = {
                **interview.interview_report,
                "config_revision": config,
            }
        user.pipeline_report = {**user.pipeline_report, "config_revision": config}
        await db.commit()
        for application in applications:
            _, digest = await application_snapshot(db, user.id, application.id)
            application.report = {**application.report, "fingerprint": digest}
        await db.commit()
        before = [(await client.get(path, headers=headers)).json() for path in paths]
        row = await saved_analysis(db, user, record)
        job = await service.start(
            db,
            AuthContext(user=user, auth_method="jwt"),
            row,
            RunAnalysis(intent_id=uuid4(), expected_revision=row.revision),
        )
        job.state, job.claim_id = "analyzing", "claim"
        await db.commit()

        async def output(*args, **kwargs):
            return extraction()

        monkeypatch.setattr(service, "analyze_section", output)
        await service.execute(
            SimpleNamespace(
                sessions=async_sessionmaker(db_engine, expire_on_commit=False)
            ),
            job.id,
            "claim",
        )
        await db.refresh(row)
        assert row.review_state == "saved"
        response = None
    else:
        row = await saved_analysis(db, user, record)
        if operation == "non_report_field":
            row.draft = {"items": [extraction()["items"][1]]}
            await db.commit()
        response = await client.patch(
            f"/api/job-analyses/{row.id}/review",
            headers=headers,
            json={
                "expected_revision": row.revision,
                "target_revision": service.target_revision(record),
                "items": [
                    {"id": item["id"], "decision": "accepted"}
                    for item in row.draft["items"]
                ],
            },
        )
    if response is not None:
        assert response.status_code == 200, response.text
    affected = {4}
    if target == "application" and operation in ("review", "automatic"):
        affected |= {0, 2}
    for index, path in enumerate(paths):
        after = (await client.get(path, headers=headers)).json()
        assert after["report"] == before[index]["report"]
        assert after["generation"] == before[index]["generation"] + int(
            index in affected
        )
        assert bool(after["stale_reason"]) == (index in affected)
    for job in jobs:
        await db.refresh(job)
        invalidated = job.scope == "PIPELINE" or (
            target == "application"
            and operation in ("review", "automatic")
            and (
                job.application_id == applications[0].id or job.round_id == rounds[0].id
            )
        )
        assert job.state == ("invalidated" if invalidated else "complete")
        assert job.manifest == ({} if invalidated else {"retained": True})


@pytest.mark.parametrize(
    "field",
    ["projects", "skills", "ai_permissions", "work_history", "work_history_metadata"],
)
async def test_profile_invalidates_only_reports_that_use_changed_input(
    client, db, reports, field
):
    user, headers, applications, rounds, jobs, paths, before = reports
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if field == "projects":
        update = {"projects": [{**profile.projects[0], "description": "SQL service"}]}
    elif field == "skills":
        update = {"skills": ["SQL"]}
    elif field == "ai_permissions":
        update = {"ai_permissions": {"projects": False}}
    else:
        update = {
            "work_history": [
                {
                    **profile.work_history[0],
                    **(
                        {"current": False}
                        if field == "work_history_metadata"
                        else {"description": "Built SQL services"}
                    ),
                }
            ]
        }
    response = await client.put(
        "/api/profile",
        headers=headers,
        json={"expected_revision": profile.revision, **update},
    )
    assert response.status_code == 200, response.text
    for index, path in enumerate(paths):
        after = (await client.get(path, headers=headers)).json()
        if field in ("skills", "work_history") or (
            field == "work_history_metadata" and index == 4
        ):
            assert after["generation"] == before[index]["generation"] + 1
            assert after["report"] is None and after["stale_reason"]
        else:
            assert after == before[index]
