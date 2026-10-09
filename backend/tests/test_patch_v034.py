"""Saved feedback and reviewed AI archives remain portable, inert and bounded."""

import io
import json
import zipfile
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select
from tests.test_interview_feedback import canned
from tests.test_job_analyses import POSTING, saved_analysis
from tests.test_portability import _honest_report
from tests.test_report_scopes import pipeline_output
from tests.test_workspace_v030 import post
from tests.test_workspace_v030 import workspace as workspace

from app.models import (
    Application,
    ApplicationStatusHistory,
    JobLead,
    Round,
    RoundType,
    UserProfile,
)
from app.schemas.job_analysis import CATEGORIES
from app.services import interview_jobs
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import (
    clear_existing_import_data,
    import_payload_data,
)
from app.services.interview_evidence import (
    application_evidence_sources,
    application_snapshot,
    evidence_sources,
    fingerprint,
    pipeline_evidence_sources,
    pipeline_snapshot,
    snapshot,
)
from app.services.interview_text import validate_section


async def export(db, owner):
    return await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(owner, session)
    )


async def fixture(client, db, workspace, monkeypatch, language):
    owner, headers, recipient, _, statuses = workspace
    app = await post(
        client,
        "/applications",
        {
            "company": "North",
            "job_title": "Developer",
            "status_id": statuses["applied"],
            "applied_at": "2026-01-01",
            "source_text": POSTING,
        },
        headers,
    )
    record = await db.get(Application, app["id"])
    record.source_text = POSTING
    profile = UserProfile(
        user_id=owner.id,
        work_history=[
            {
                "id": str(uuid4()),
                "company": "North",
                "title": "Developer",
                "description": "Built a Python service",
            }
        ],
        skills=["Python"],
    )
    db.add(profile)
    interview = Round(
        application_id=record.id,
        round_type_id=await db.scalar(select(RoundType.id)),
        notes_summary="Saved discussion",
        preparation={"plan": ["Keep existing"]},
    )
    db.add(interview)
    await db.commit()
    response = await client.put(
        f"/api/rounds/{interview.id}/transcript",
        headers={**headers, "Expected-Transcript-Generation": "0"},
        json={
            "text": "I built the Python service and tested SQL queries.",
            "format": "txt",
        },
    )
    assert response.status_code == 200, response.text
    segments = response.json()["transcript"]["segments"]
    segments[0]["role"] = "candidate"
    response = await client.patch(
        f"/api/rounds/{interview.id}/transcript",
        headers={**headers, "Expected-Transcript-Generation": "1"},
        json={"segments": segments},
    )
    assert response.status_code == 200, response.text
    lead_data = await post(
        client, "/job-leads", {"title": "Developer", "text": POSTING}, headers
    )
    lead = await db.get(JobLead, lead_data["id"])
    for target in (record, lead):
        extraction = await saved_analysis(db, owner, target)
        revision = (
            target.evidence_revision
            if isinstance(target, Application)
            else target.revision
        )
        response = await client.patch(
            f"/api/job-analyses/{extraction.id}/review",
            headers=headers,
            json={
                "expected_revision": extraction.revision,
                "target_revision": revision,
                "items": [{"id": "python", "decision": "accepted"}],
            },
        )
        assert response.status_code == 200, response.text
        await db.refresh(target)
        match = await saved_analysis(db, owner, target, "PROFILE_MATCH")
        match.draft = {
            "rows": [
                {
                    "requirement_id": target.confirmed_requirements[0]["id"],
                    "state": "no_evidence",
                    "evidence": [],
                    "why": "More saved detail is needed.",
                }
            ]
        }
        await db.commit()
    draft = await saved_analysis(db, owner, record, "PREPARATION", interview.id)
    draft.draft = {name: [] for name in CATEGORIES}
    draft.draft = {
        **draft.draft,
        "plan": [
            {
                "id": "plan",
                "text": "Practice Python",
                "requirement_ids": [record.confirmed_requirements[0]["id"]],
                "evidence": [],
            }
        ],
    }
    await db.commit()
    response = await client.post(
        f"/api/job-analyses/{draft.id}/apply",
        headers=headers,
        json={
            "expected_revision": 0,
            "target_revision": interview.revision,
            "selected_ids": ["plan"],
        },
    )
    assert response.status_code == 200, response.text
    await db.refresh(record)
    await db.refresh(interview)
    data, _ = await snapshot(db, owner.id, interview.id)
    sources, _ = await evidence_sources(data)
    findings = validate_section(canned(sources), sources)["findings"]
    assert findings
    cited = {c["source_id"] for f in findings for c in f["citations"]}
    interview.interview_report = {
        **_honest_report("APPLICATION", sources=sources),
        "scope": "INTERVIEW",
        "round_id": interview.id,
        "source_media_id": None,
        "output_language": language,
        "findings": findings,
        "sources": [s for s in sources if s["id"] in cited],
    }
    interview.interview_report.pop("application_id", None)
    await db.commit()
    data, _ = await application_snapshot(db, owner.id, record.id)
    sources, _ = await application_evidence_sources(data)
    requirement = next(s for s in sources if s["kind"] == "requirement")
    record.report = {
        **_honest_report(
            "APPLICATION", sources=[requirement], application_id=record.id
        ),
        "output_language": language,
    }
    await db.commit()
    data, digest = await pipeline_snapshot(
        db, owner.id, "all", datetime.now(UTC), "Europe/Belgrade"
    )
    sources, limits = await pipeline_evidence_sources(data)
    section = validate_section(pipeline_output(sources), sources, "PIPELINE")
    job = SimpleNamespace(
        scope="PIPELINE",
        user_id=owner.id,
        generation=owner.pipeline_generation,
        fingerprint=digest,
        uncertain=False,
        total_sections=1,
        checkpoints=[section],
        provider="openai",
        model="openai/fixture",
        config_revision="fixture",
        manifest={
            "output_language": language,
            "prompt_revision": "a" * 64,
            "period": "all",
            "as_of": data["as_of"],
            "time_zone": data["time_zone"],
        },
        state="analyzing",
    )

    async def guard(*args, **kwargs):
        return job, data, None

    monkeypatch.setattr(interview_jobs, "guard", guard)
    await interview_jobs.publish(db, "fixture", "claim", sources, limits)
    await db.commit()
    await db.refresh(owner)
    return owner, headers, recipient, record, interview, statuses


@pytest.mark.parametrize("language", ["en", "sr-Latn"])
@pytest.mark.parametrize("stale", [False, True])
@pytest.mark.parametrize("legacy", [False, True])
async def test_zip_roundtrip_all_feedback_scopes_and_saved_analyses(
    client, db, workspace, monkeypatch, language, stale, legacy
):
    owner, headers, recipient, record, interview, statuses = await fixture(
        client, db, workspace, monkeypatch, language
    )
    if legacy:
        owner.pipeline_report = {
            k: v
            for k, v in owner.pipeline_report.items()
            if k not in ("evidence_snapshot", "evidence_fingerprint", "evidence_ids")
        }
        await db.commit()
    if stale:
        # Later tied transitions changed live metrics and made the retained
        # report stale. These must not rewrite the original report input.
        when = datetime.now(UTC) + timedelta(minutes=1)
        previous = record.status_id
        for meaning in ("screening", "interviewing"):
            db.add(
                ApplicationStatusHistory(
                    application_id=record.id,
                    from_status_id=previous,
                    to_status_id=statuses[meaning],
                    from_meaning="applied" if meaning == "screening" else "screening",
                    to_meaning=meaning,
                    from_meaning_provenance="recorded",
                    to_meaning_provenance="recorded",
                    time_provenance="recorded",
                    changed_at=when,
                )
            )
            previous = statuses[meaning]
        record.status_id, record.status_meaning = (
            statuses["interviewing"],
            "interviewing",
        )
        record.evidence_revision += 1
        await db.commit()
    response = await client.get("/api/export/zip", headers=headers)
    assert response.status_code == 200, response.text
    with zipfile.ZipFile(io.BytesIO(response.content)) as zipped:
        archive = json.loads(zipped.read("data.json"))
    original = await export(db, owner.id)
    report = archive["models"]["User"][0]["pipeline_report"]
    if not legacy:
        assert report["evidence_snapshot"] and report[
            "evidence_fingerprint"
        ] == fingerprint(report["evidence_snapshot"])
        assert (
            report["evidence_snapshot"]["metrics"]["missing_evidence"]["denominator"]
            == 1
        )
    for _ in range(2):
        await clear_existing_import_data(db, recipient.id)
        await import_payload_data(db, recipient.id, archive, {}, lambda **kwargs: None)
        await db.commit()
        restored = await export(db, recipient.id)
        restored_report = restored["models"]["User"][0]["pipeline_report"]
        assert (
            restored_report["fingerprint"] == restored_report["config_revision"] == ""
        )
        if not legacy:
            assert restored_report["evidence_snapshot"] == report["evidence_snapshot"]
        else:
            assert (
                restored_report["evidence_snapshot"]["metrics"]["missing_evidence"][
                    "denominator"
                ]
                == 1
            )
        assert restored_report["findings"] == report["findings"]
        assert restored["models"]["Round"][-1]["interview_report"]["findings"]
        assert restored["models"]["Application"][-1]["report"]["findings"]
        assert restored["models"]["Round"][-1]["preparation"]["plan"] == [
            "Keep existing",
            "Practice Python",
        ]
        assert all(
            v is False
            for v in restored["models"]["UserProfile"][0]["ai_permissions"].values()
        )
        assert len(restored["models"]["JobAnalysis"]) == 5
        assert all(
            a["review_state"] == "imported"
            and not a["fingerprint"]
            and not a["input_revisions"]
            for a in restored["models"]["JobAnalysis"]
        )
        for analysis in restored["models"]["JobAnalysis"]:
            assert analysis["draft"] in [
                a["draft"]
                for a in original["models"]["JobAnalysis"]
                if a["kind"] == analysis["kind"]
            ]
        archive = restored
    assert (await export(db, owner.id))["models"] == original["models"]


def test_pre_workspace_archive_has_no_reviewed_requirement_insights():
    from app.services.interview_archive import _archived_pipeline_insights

    app_id = str(uuid4())
    result = _archived_pipeline_insights(
        {"Application": [{"id": app_id, "company": "North", "job_title": "Developer"}]},
        {"applications": [{"application_id": app_id}]},
        {},
    )
    assert result == {
        "repeated_requirements": {"items": [], "denominator": 0},
        "missing_evidence": {"items": [], "denominator": 0},
    }


async def test_pipeline_snapshot_tampering_and_foreign_identity_roll_back(
    client, db, workspace, monkeypatch
):
    owner, _, recipient, _, _, _ = await fixture(
        client, db, workspace, monkeypatch, "en"
    )
    archive = await export(db, owner.id)
    recipient_id = recipient.id
    for change in ("snapshot", "citation", "foreign"):
        bad = deepcopy(archive)
        report = bad["models"]["User"][0]["pipeline_report"]
        if change == "snapshot":
            report["evidence_snapshot"]["metrics"]["total_applications"] = 999
        elif change == "citation":
            report["sources"][0]["text"] = "Invented passage"
            report["findings"][0]["citations"][0]["quote"] = "Invented passage"
        else:
            report["evidence_snapshot"]["metrics"]["applications"][0][
                "application_id"
            ] = str(uuid4())
            report["evidence_fingerprint"] = fingerprint(report["evidence_snapshot"])
        with pytest.raises(ValueError):
            async with db.begin_nested():
                await import_payload_data(
                    db, recipient_id, bad, {}, lambda **kwargs: None
                )
        assert not (
            await db.scalars(
                select(Application).where(Application.user_id == recipient_id)
            )
        ).all()
