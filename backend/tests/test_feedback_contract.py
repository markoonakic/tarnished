"""Review B1/B2: current wire contracts and retained prompt identity, offline only."""

import json
from copy import deepcopy
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests import test_interview_feedback as interview
from tests import test_report_scopes as scoped
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_feedback_coaching import coached_section, sample_sources
from tests.test_report_responses_protocol import responses_fixture, text_settings

from app.models import Application, InterviewJob, Round, User
from app.services import interview_jobs as jobs
from app.services import interview_text as text
from app.services.transcription_executor import TranscriptionExecutor

SCOPES = ["INTERVIEW", "APPLICATION", "PIPELINE"]


def envelope(section, protocol):
    if protocol == "responses":
        return json.dumps(
            {
                "object": "response",
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [
                            {"type": "output_text", "text": json.dumps(section)}
                        ],
                    }
                ],
            }
        ).encode()
    return json.dumps(
        {
            "choices": [
                {"finish_reason": "stop", "message": {"content": json.dumps(section)}}
            ]
        }
    ).encode()


@pytest.mark.parametrize("protocol", ["chat_completions", "responses"])
@pytest.mark.parametrize("scope", SCOPES)
@pytest.mark.parametrize("output", ["rich", "empty", "missing", "wrong_scope"])
async def test_current_wire_contract(protocol, scope, output):
    sources = sample_sources()
    section = coached_section(sources, scope)
    if output == "missing":
        section["findings"][0].pop("coaching")
    elif output == "empty":
        section = {"findings": [], "limitations": []}
    elif output == "wrong_scope":
        section["findings"][0]["coaching"]["kind"] = (
            "application" if scope != "APPLICATION" else "pipeline"
        )
    async with responses_fixture(body=envelope(section, protocol)) as (endpoint, calls):
        if output in ("missing", "wrong_scope"):
            with pytest.raises(text.ReportFailure) as exc:
                await text.analyze_section(
                    text_settings(endpoint, protocol), sources, [], scope
                )
            assert exc.value.category == "report_grounding"
        else:
            actual = await text.analyze_section(
                text_settings(endpoint, protocol), sources, [], scope
            )
            assert actual["findings"] == section["findings"]
    assert len(calls) == 1  # No repair call or automatic retry.
    expected_path = "/responses" if protocol == "responses" else "/chat/completions"
    assert calls[0][0].startswith(f"POST /v1{expected_path} ".encode())


@pytest.mark.parametrize(
    "scope,field",
    [
        ("INTERVIEW", "answer_citation"),
        ("INTERVIEW", "better_answer"),
        ("INTERVIEW", "action"),
        ("APPLICATION", "context_citations"),
        ("APPLICATION", "branches"),
        ("APPLICATION", "action"),
    ],
)
def test_required_current_fields_and_legacy_read_compatibility(scope, field):
    sources = sample_sources()
    section = coached_section(sources, scope)
    legacy = deepcopy(section)
    legacy["findings"][0].pop("coaching")
    assert text.validate_section(legacy, sources, scope) == legacy
    if field == "action":
        section["findings"][0].pop(field)
    else:
        section["findings"][0]["coaching"].pop(field)
    with pytest.raises(ValueError):
        text.validate_section(section, sources, scope, require_current_contract=True)


@pytest.mark.parametrize("protocol", ["chat_completions", "responses"])
@pytest.mark.parametrize(
    "record", ["absent", "split", "complete", "braces", "oversized"]
)
async def test_pipeline_fallback_is_explicit_and_source_checked(protocol, record):
    sources = sample_sources()
    section = coached_section(sources, "PIPELINE")
    finding = section["findings"][0]
    finding.pop("coaching")
    finding["citations"] = finding["citations"][:1]  # Cites the deterministic metric.
    finding["coaching_unavailable"] = "complete_record_unavailable"
    if record == "absent":
        sources = [s for s in sources if s["id"] != "pipeline:recorded_approaches:0"]
    elif record == "split":
        original = sources[5]
        raw = original["text"]
        split = raw.index('"company"')
        sources[5] = {**original, "text": raw[:split]}
        sources.append(
            {**original, "id": "pipeline:recorded_approaches:4000", "text": raw[split:]}
        )
    elif record == "braces":
        sources[5]["text"] = sources[5]["text"].replace(
            "Example Labs", "Example {Labs}"
        )
    elif record == "oversized":
        sources[5]["text"] = sources[5]["text"].replace("Example Labs", "X" * 2100)
    async with responses_fixture(body=envelope(section, protocol)) as (endpoint, calls):
        if record in ("complete", "braces"):
            with pytest.raises(text.ReportFailure) as exc:
                await text.analyze_section(
                    text_settings(endpoint, protocol), sources, [], "PIPELINE"
                )
            assert exc.value.category == "report_grounding"
        else:
            result = await text.analyze_section(
                text_settings(endpoint, protocol), sources, [], "PIPELINE"
            )
            assert (
                result["findings"][0]["coaching_unavailable"]
                == "complete_record_unavailable"
            )
    assert len(calls) == 1


async def admitted(scope, client, db, workspace, monkeypatch):
    from app.main import app

    if scope == "INTERVIEW":
        rid = await interview.setup_round(
            client, db, workspace, "http://127.0.0.1:9/v1"
        )
        path = f"/api/rounds/{rid}/interview-feedback"
    else:
        await scoped.configure(db, "http://127.0.0.1:9/v1")
        path = (
            f"/api/applications/{workspace[4]}/feedback"
            if scope == "APPLICATION"
            else "/api/analytics/feedback?period=all"
        )
    executor = TranscriptionExecutor(
        async_sessionmaker(db.bind, expire_on_commit=False)
    )
    executor.accepting = True  # Admit through the real API, without starting its loop.
    monkeypatch.setattr(app.state, "transcription_executor", executor, raising=False)
    state = (await client.get(path)).json()
    body = {
        "intent_id": str(uuid4()),
        "config_revision": state["capability"]["configuration_revision"],
    }
    if scope == "PIPELINE":
        body["period"] = "all"
    else:
        body["generation"] = state["generation"]
    response = await client.post(path, json=body)
    assert response.status_code == 202, response.text
    job = await db.get(InterviewJob, response.json()["id"], populate_existing=True)
    _, data, _ = await jobs.guard(db, job.id, None, ("queued",))
    sources, limits, batches = await jobs._scope_evidence(scope, data)
    assert len(batches) == 1
    await db.commit()
    return path, job, sources, limits


@pytest.mark.parametrize("scope", SCOPES)
async def test_checkpoint_rejects_new_plain_finding(
    scope, client, db, workspace, monkeypatch
):
    _, job, sources, _ = await admitted(scope, client, db, workspace, monkeypatch)
    job.state, job.claim_id, job.uncertain, job.total_sections = (
        "analyzing",
        str(uuid4()),
        True,
        1,
    )
    await db.commit()
    section = coached_section(sources, scope)
    section["findings"][0].pop("coaching")
    with pytest.raises(text.ReportFailure) as exc:
        await jobs.checkpoint(db, job.id, job.claim_id, 0, section, sources)
    assert exc.value.category == "report_grounding"
    assert job.checkpoints == []


@pytest.mark.parametrize(
    "change", ["missing", "unknown", "both", "no_metric", "wrong_scope"]
)
def test_pipeline_fallback_cannot_hide_missing_or_cross_scope_content(change):
    sources = sample_sources()
    section = coached_section(sources, "PIPELINE")
    finding = section["findings"][0]
    finding["coaching_unavailable"] = "complete_record_unavailable"
    if change != "both":
        finding.pop("coaching")
        finding["citations"] = finding["citations"][:1]
    if change == "missing":
        finding.pop("coaching_unavailable")
    elif change == "unknown":
        finding["coaching_unavailable"] = "model_did_not_supply_it"
    elif change == "no_metric":
        sources[4]["kind"] = "profile"
    sources = (
        [s for s in sources if s["id"] != "pipeline:recorded_approaches:0"]
        if change != "both"
        else sources
    )
    with pytest.raises(ValueError):
        text.validate_section(
            section,
            sources,
            "APPLICATION" if change == "wrong_scope" else "PIPELINE",
            require_current_contract=True,
        )


def test_prompt_identity_is_not_a_daily_clock_or_settings_revision(monkeypatch):
    from datetime import UTC, datetime

    before = {scope: text.prompt_revision(scope) for scope in SCOPES}
    original_prompt = text._system_prompt("INTERVIEW")

    class Tomorrow(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2099, 1, 1, tzinfo=UTC)

    monkeypatch.setattr(text, "datetime", Tomorrow)
    assert text._system_prompt("INTERVIEW") != original_prompt
    assert {scope: text.prompt_revision(scope) for scope in SCOPES} == before
    monkeypatch.setattr(
        text, "OUTPUT_CONTRACT_REVISION", text.OUTPUT_CONTRACT_REVISION + 1
    )
    assert all(text.prompt_revision(scope) != before[scope] for scope in SCOPES)


@pytest.mark.parametrize("scope", SCOPES)
@pytest.mark.parametrize(
    "revision", ["absent", None, "0" * 64, "", "f" * 65, True, 3, "z" * 64]
)
def test_strict_archive_revision_is_optional_and_bounded(scope, revision):
    from app.services.interview_archive import (
        ArchivedInterviewReport,
        ArchivedScopedReport,
    )

    report = {
        "version": 1,
        "scope": scope,
        "run_at": "2026-01-01T00:00:00Z",
        "provider": "fixture",
        "model": "fixture",
        "config_revision": "old",
        "fingerprint": "",
        "required_scopes": jobs.READ_SCOPES,
        "findings": [],
        "sources": [],
        "coverage": {"sections": 1, "sources": 1, "characters": 1},
        "limitations": [],
    }
    if scope == "INTERVIEW":
        report["round_id"] = str(uuid4())
    if revision != "absent":
        report["prompt_revision"] = revision
    model = ArchivedInterviewReport if scope == "INTERVIEW" else ArchivedScopedReport
    if revision in ("absent", None, "0" * 64):
        assert model.model_validate(report).prompt_revision == (
            None if revision == "absent" else revision
        )
    else:
        with pytest.raises(ValueError):
            model.model_validate(report)


def change_prompt(monkeypatch):
    original = text._system_prompt
    monkeypatch.setattr(
        text,
        "_system_prompt",
        lambda *args, **kwargs: (
            original(*args, **kwargs) + " Use revised feedback instructions."
        ),
    )


@pytest.mark.parametrize("scope", SCOPES)
@pytest.mark.parametrize("legacy", [False, True])
async def test_prompt_only_staleness_keeps_saved_report_and_fingerprint(
    scope, legacy, client, db, workspace, monkeypatch
):
    path, job, sources, limits = await admitted(
        scope, client, db, workspace, monkeypatch
    )
    job.state, job.claim_id, job.uncertain, job.total_sections = (
        "analyzing",
        str(uuid4()),
        True,
        1,
    )
    await db.commit()
    await jobs.checkpoint(
        db, job.id, job.claim_id, 0, coached_section(sources, scope), sources
    )
    await db.commit()
    await jobs.publish(db, job.id, job.claim_id, sources, limits)
    await db.commit()
    current = (await client.get(path)).json()
    assert current["stale_reason"] is None
    saved = deepcopy(current["report"])
    if legacy:
        saved.pop("prompt_revision", None)
        model, identity, attr = {
            "INTERVIEW": (Round, job.round_id, "interview_report"),
            "APPLICATION": (Application, job.application_id, "report"),
            "PIPELINE": (User, job.user_id, "pipeline_report"),
        }[scope]
        row = await db.get(model, identity, populate_existing=True)
        setattr(row, attr, saved)
        await db.commit()
    else:
        change_prompt(monkeypatch)
    after = (await client.get(path)).json()
    assert after["report"] == saved
    assert after["generation"] == current["generation"]
    assert (
        after["capability"]["configuration_revision"]
        == current["capability"]["configuration_revision"]
    )
    assert after["report"]["fingerprint"] == job.fingerprint
    assert after["stale_reason"] and "prompt" in after["stale_reason"]
    assert ("unknown" if legacy else "changed") in after["stale_reason"]
    assert (
        await db.scalars(
            select(InterviewJob).where(InterviewJob.user_id == job.user_id)
        )
    ).all() == [job]


@pytest.mark.parametrize("scope", SCOPES)
@pytest.mark.parametrize("boundary", ["queued", "checkpoint", "publish"])
@pytest.mark.parametrize("legacy", [False, True])
async def test_pending_prompt_identity_blocks_changed_or_unknown_job(
    scope, boundary, legacy, client, db, workspace, monkeypatch
):
    _, job, sources, limits = await admitted(scope, client, db, workspace, monkeypatch)
    if boundary != "queued":
        job.state, job.claim_id, job.uncertain, job.total_sections = (
            "analyzing",
            str(uuid4()),
            True,
            1,
        )
        await db.commit()
    if boundary == "publish":
        await jobs.checkpoint(
            db, job.id, job.claim_id, 0, coached_section(sources, scope), sources
        )
        await db.commit()
    before_manifest = deepcopy(job.manifest)
    if legacy:
        job.manifest = {k: v for k, v in job.manifest.items() if k != "prompt_revision"}
        await db.commit()
    else:
        change_prompt(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        if boundary == "queued":
            await jobs.guard(db, job.id, None, ("queued",))
        elif boundary == "checkpoint":
            await jobs.checkpoint(
                db, job.id, job.claim_id, 0, coached_section(sources, scope), sources
            )
        else:
            await jobs.publish(db, job.id, job.claim_id, sources, limits)
    assert exc.value.status_code == 409
    assert "prompt" in exc.value.detail
    assert job.fingerprint == before_manifest["fingerprint"]
    assert job.manifest.get("prompt_revision") == (
        None if legacy else before_manifest["prompt_revision"]
    )
