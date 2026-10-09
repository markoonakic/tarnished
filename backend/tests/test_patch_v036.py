"""Historical report input survives edits; unverifiable reports never block data."""

import json
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select
from tests.test_patch_v034 import export, fixture
from tests.test_workspace_v030 import workspace as workspace

from app.models import Application, Round
from app.services import interview_jobs
from app.services.import_execution import import_payload_data
from app.services.interview_evidence import fingerprint


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION"])
async def test_publication_retains_original_bounded_input(
    client, db, workspace, monkeypatch, scope
):
    owner, _, _, app, interview, _ = await fixture(
        client, db, workspace, monkeypatch, "en"
    )
    report = interview.interview_report if scope == "INTERVIEW" else app.report
    sources = report["evidence_snapshot"]["sources"]
    job = SimpleNamespace(
        scope=scope,
        round_id=interview.id,
        application_id=app.id,
        generation=interview.interview_generation
        if scope == "INTERVIEW"
        else app.report_generation,
        fingerprint="a" * 64,
        uncertain=False,
        total_sections=1,
        checkpoints=[{"findings": report["findings"], "limitations": []}],
        provider="openai",
        model="fixture",
        config_revision="fixture",
        manifest={"prompt_revision": "a" * 64},
        state="analyzing",
    )

    async def guard(*args, **kwargs):
        return job, {}, None

    monkeypatch.setattr(interview_jobs, "guard", guard)
    await interview_jobs.publish(db, "fixture", "claim", sources, [])
    await db.refresh(interview if scope == "INTERVIEW" else app)
    saved = interview.interview_report if scope == "INTERVIEW" else app.report
    assert saved["evidence_snapshot"] == {"sources": sources}
    assert saved["evidence_fingerprint"] == fingerprint(saved["evidence_snapshot"])
    assert len(str(saved)) <= 1_000_000


@pytest.mark.parametrize("change", ["legacy_stale", "quote", "source", "transcript"])
async def test_only_unverifiable_report_is_skipped(
    client, db, workspace, monkeypatch, change
):
    owner, _, recipient, app, interview, statuses = await fixture(
        client, db, workspace, monkeypatch, "en"
    )
    if change == "legacy_stale":
        app.report = {
            k: v
            for k, v in app.report.items()
            if k not in ("evidence_snapshot", "evidence_fingerprint", "evidence_ids")
        }
        app.status_meaning, app.status_id = "interviewing", statuses["interviewing"]
        await db.commit()
    archive = deepcopy(await export(db, owner.id))
    report = archive["models"]["Application"][0]["report"]
    # Real archives are decoded JSON, with independent input and output objects.
    archive = json.loads(json.dumps(archive))
    report = archive["models"]["Application"][0]["report"]
    if change == "quote":
        report["findings"][0]["citations"][0]["quote"] = "Invented quote"
    elif change == "source":
        report["sources"][0]["text"] = "Invented passage"
        report["findings"][0]["citations"][0]["quote"] = "Invented passage"
    elif change == "transcript":
        # The saved interview remains verifiable even after its transcript is replaced.
        archive["models"]["Round"][0]["current_transcript"]["segments"][0]["id"] = str(
            uuid4()
        )
        archive["models"]["Round"][0]["current_transcript"]["segments"][0]["text"] = (
            "Later replacement"
        )
        report["findings"][0]["citations"][0]["quote"] = "Invented quote"
    result = await import_payload_data(db, recipient.id, archive, {}, lambda **kw: None)
    assert result["skipped_reports"] == 1
    assert "could not be verified" in result["warnings"][0]
    restored = await db.scalar(
        select(Application).where(Application.user_id == recipient.id)
    )
    assert restored.report is None
    restored_interview = await db.scalar(
        select(Round).where(Round.application_id == restored.id)
    )
    assert restored_interview.interview_report["findings"]
    assert restored_interview.preparation["plan"] == [
        "Keep existing",
        "Practice Python",
    ]
    assert await db.scalar(
        select(type(owner).pipeline_report).where(type(owner).id == recipient.id)
    )


@pytest.mark.parametrize("change", ["hash", "foreign", "bounds", "sibling"])
async def test_snapshot_structural_tampering_still_rejects_archive(
    client, db, workspace, monkeypatch, change
):
    owner, _, recipient, _, _, _ = await fixture(
        client, db, workspace, monkeypatch, "en"
    )
    recipient_id = recipient.id
    archive = deepcopy(await export(db, owner.id))
    report = archive["models"]["Application"][0]["report"]
    source = report["evidence_snapshot"]["sources"][0]
    if change == "hash":
        source["text"] = "Changed input"
    elif change == "bounds":
        source["text"] = "x" * 4001
    else:
        foreign_id = str(uuid4())
        source["id"] = f"application:{foreign_id}:company:0"
        if change == "sibling":
            sibling = deepcopy(archive["models"]["Application"][0])
            sibling.update(id=foreign_id, __original_id__=foreign_id, report=None)
            archive["models"]["Application"].append(sibling)
        report["evidence_fingerprint"] = fingerprint(report["evidence_snapshot"])
    with pytest.raises(ValueError):
        async with db.begin_nested():
            await import_payload_data(db, recipient_id, archive, {}, lambda **kw: None)
    assert not (
        await db.scalars(select(Application).where(Application.user_id == recipient_id))
    ).all()
