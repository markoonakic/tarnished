"""Authored output fixtures test contracts, not live model factual quality."""

import json
from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests import test_interview_feedback as interview
from tests import test_report_scopes as scoped
from tests.test_core_mutation_integrity import workspace as workspace

from app.models import Application, Round
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import import_payload_data
from app.services.interview_text import prompt_revision, validate_section
from app.services.transcription_executor import TranscriptionExecutor

APP_ID = "11111111-1111-4111-8111-111111111111"
OTHER_ID = "22222222-2222-4222-8222-222222222222"


def sample_sources():
    record = {
        "application_id": APP_ID,
        "company": "Example Labs",
        "role": "Engineer",
        "source": None,
        "current_stage": "applied",
        "stage_at_report_date": "applied",
        "applied_at": "2026-01-05",
        "history_incomplete": False,
    }
    round_record = {
        "application_id": APP_ID,
        "round_type": "Technical",
        "outcome": None,
        "scheduled_at": "2026-01-10 09:00:00+00:00",
        "completed_at": None,
    }
    return [
        {
            "id": "transcript:answer:0",
            "kind": "transcript",
            "role": "candidate",
            "text": "I checked the query plan. I did not record latency.",
        },
        {
            "id": "transcript:question:0",
            "kind": "transcript",
            "role": "interviewer",
            "text": "What did you observe?",
        },
        {
            "id": "application:one:job_description:0",
            "kind": "requirement",
            "text": "Diagnose production incidents using measurements.",
        },
        {
            "id": "application:one:company:0",
            "kind": "application",
            "text": "Example Labs",
        },
        {
            "id": "pipeline:metrics:0",
            "kind": "pipeline_metrics",
            "text": '{"total_applications": 1}',
        },
        {
            "id": "pipeline:recorded_approaches:0",
            "kind": "pipeline_record",
            "text": json.dumps({"applications": [record]}),
        },
        {
            "id": "pipeline:rounds:0",
            "kind": "pipeline_record",
            "text": json.dumps({"rounds": [round_record]}),
        },
    ]


def coached_section(sources, scope):
    finding = {
        "subject": {
            "INTERVIEW": "candidate",
            "APPLICATION": "application",
            "PIPELINE": "pipeline",
        }[scope],
        "observation": "The supplied record leaves the result unconfirmed.",
        "interpretation": "A recorded step is not proof of its outcome. Check the evidence before choosing the next step.",
        "action": "Check your own notes. Keep unavailable results unknown rather than guessing a result or deadline.",
        "limitations": "No last contact or agreed reply date is supplied.",
        "citations": [],
    }
    coaching = {
        "version": 1,
        "kind": scope.lower(),
        "title": "Separate the recorded step from its result",
    }
    if scope == "INTERVIEW":
        candidate = next(s for s in sources if s.get("role") == "candidate")
        requirement = next(s for s in sources if s["kind"] == "requirement")
        finding["citations"] = [
            {"source_id": s["id"], "quote": s["text"]} for s in (candidate, requirement)
        ]
        coaching.update(answer_citation=0, better_answer=candidate["text"])
        question = next((s for s in sources if s.get("role") == "interviewer"), None)
        if question:
            coaching["question"] = {
                "source_id": question["id"],
                "quote": question["text"],
            }
    elif scope == "APPLICATION":
        source = next(s for s in sources if ":company:" in s["id"])
        finding["citations"] = [{"source_id": source["id"], "quote": source["text"]}]
        coaching.update(
            context_citations=[0],
            branches=[
                {
                    "condition": "If this is a practice record",
                    "action": "Keep it as practice. Do not contact an employer.",
                }
            ],
            draft={
                "condition": "Only for a confirmed live case: attendance is confirmed, an agreed reply date has passed, and no newer message or prior follow-up changes the plan.",
                "text": "Hello [contact], could you confirm the next step after the interview on [attendance date]? Thank you, [name].",
            },
        )
    else:
        metrics = next(s for s in sources if s["id"] == "pipeline:metrics:0")
        records = next(
            s for s in sources if s["id"] == "pipeline:recorded_approaches:0"
        )
        record = json.loads(records["text"])["applications"][0]
        finding["topic"] = "pipeline"
        finding["citations"] = [
            {"source_id": metrics["id"], "quote": metrics["text"][:1000]},
            {
                "source_id": records["id"],
                "quote": json.dumps(record, ensure_ascii=False),
            },
        ]
        step = {
            "record_citation": 1,
            "condition": "Check your own last message and any agreed reply date first.",
            "action": "Wait if the reply window is open. The applied date alone does not make a follow-up due.",
            "round_citations": [],
        }
        rounds = next((s for s in sources if s["id"] == "pipeline:rounds:0"), None)
        if rounds:
            matching = next(
                (
                    r
                    for r in json.loads(rounds["text"])["rounds"]
                    if r["application_id"] == record["application_id"]
                ),
                None,
            )
            if matching:
                finding["citations"].append(
                    {
                        "source_id": rounds["id"],
                        "quote": json.dumps(matching, ensure_ascii=False),
                    }
                )
                step["round_citations"] = [2]
        coaching["records"] = [step]
    finding["coaching"] = coaching
    return {"findings": [finding], "limitations": []}


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
def test_coaching_accepts_new_legacy_and_empty_sections(scope):
    sources = sample_sources()
    value = coached_section(sources, scope)
    saved = validate_section(value, sources, scope)["findings"][0]
    assert saved["coaching"]["version"] == 1
    assert saved["coaching"]["kind"] == scope.lower()
    if scope == "INTERVIEW":
        assert saved["coaching"]["question"]["quote"] == "What did you observe?"
    if scope == "PIPELINE":
        assert json.loads(saved["citations"][2]["quote"])["outcome"] is None
    value["findings"][0].pop("coaching")
    assert "coaching" not in validate_section(value, sources, scope)["findings"][0]
    assert (
        validate_section({"findings": [], "limitations": []}, sources, scope)[
            "findings"
        ]
        == []
    )


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
@pytest.mark.parametrize(
    "field,bad",
    [
        ("version", 2),
        ("version", True),
        ("title", 4),
        ("kind", "wrong"),
    ],
)
def test_coaching_rejects_unknown_versions_and_types(scope, field, bad):
    value = coached_section(sample_sources(), scope)
    value["findings"][0]["coaching"][field] = bad
    with pytest.raises(ValueError):
        validate_section(value, sample_sources(), scope)


@pytest.mark.parametrize(
    "change",
    [
        "foreign",
        "inexact",
        "unknown_question",
        "candidate_question",
        "interviewer_claim",
        "wrong_answer",
        "bool_index",
        "long_answer",
        "blank_answer",
    ],
)
def test_interview_coaching_preserves_attribution_and_bounds(change):
    sources = sample_sources()
    value = coached_section(sources, "INTERVIEW")
    finding = value["findings"][0]
    coaching = finding["coaching"]
    if change == "foreign":
        coaching["question"]["source_id"] = "foreign:question"
    elif change == "inexact":
        coaching["question"]["quote"] = "Invented question"
    elif change in ("unknown_question", "candidate_question"):
        sources[1]["role"] = "unknown" if change == "unknown_question" else "candidate"
    elif change == "interviewer_claim":
        finding["citations"].append(coaching["question"])
    elif change in ("wrong_answer", "bool_index"):
        coaching["answer_citation"] = 1 if change == "wrong_answer" else True
    else:
        coaching["better_answer"] = "x" * 1201 if change == "long_answer" else " "
    with pytest.raises(ValueError):
        validate_section(value, sources)


@pytest.mark.parametrize(
    "change",
    [
        "empty_branches",
        "long_condition",
        "draft_type",
        "cross_scope",
    ],
)
def test_application_coaching_rejects_invalid_context_branches_and_drafts(change):
    sources = sample_sources()
    value = coached_section(sources, "APPLICATION")
    coaching = value["findings"][0]["coaching"]
    if change == "empty_branches":
        coaching["branches"] = []
    elif change == "long_condition":
        coaching["branches"][0]["condition"] = "x" * 1201
    elif change == "draft_type":
        coaching["draft"]["text"] = ["not a string"]
    else:
        value["findings"][0]["coaching"] = coached_section(sources, "PIPELINE")[
            "findings"
        ][0]["coaching"]
    with pytest.raises(ValueError):
        validate_section(value, sources, "APPLICATION")


def test_pipeline_coaching_keeps_three_records_and_their_rounds_with_metric():
    sources = sample_sources()
    records = json.loads(sources[5]["text"])["applications"]
    rounds = json.loads(sources[6]["text"])["rounds"]
    for identity in (OTHER_ID, "33333333-3333-4333-8333-333333333333"):
        records.append({**records[0], "application_id": identity})
        rounds.append({**rounds[0], "application_id": identity})
    sources[5]["text"] = json.dumps({"applications": records})
    sources[6]["text"] = json.dumps({"rounds": rounds})
    value = coached_section(sources, "PIPELINE")
    finding = value["findings"][0]
    for record, round_record in zip(records[1:], rounds[1:], strict=True):
        index = len(finding["citations"])
        finding["citations"].extend(
            [
                {"source_id": sources[5]["id"], "quote": json.dumps(record)},
                {"source_id": sources[6]["id"], "quote": json.dumps(round_record)},
            ]
        )
        finding["coaching"]["records"].append(
            {
                "record_citation": index,
                "round_citations": [index + 1],
                "condition": "Check your own attendance record first.",
                "action": "Keep an unconfirmed result unknown.",
            }
        )
    saved = validate_section(value, sources, "PIPELINE")["findings"][0]
    assert len(saved["citations"]) == 7
    assert len(saved["coaching"]["records"]) == 3
    finding["citations"] *= 3
    bounded = validate_section(value, sources, "PIPELINE")["findings"][0]
    assert len(bounded["citations"]) == 16
    assert bounded["coaching"] == saved["coaching"]


@pytest.mark.parametrize(
    "change",
    [
        "unquoted_record",
        "partial_record",
        "wrong_source",
        "wrong_round",
        "wrong_metric",
        "empty",
        "index",
        "cross_scope",
    ],
)
def test_pipeline_coaching_requires_exact_named_records_and_matching_rounds(change):
    sources = sample_sources()
    value = coached_section(sources, "PIPELINE")
    finding = value["findings"][0]
    coaching = finding["coaching"]
    if change == "unquoted_record":
        finding["citations"][1]["quote"] = finding["citations"][1]["quote"].replace(
            "Example Labs", "Invented Labs"
        )
    elif change == "partial_record":
        finding["citations"][1]["quote"] = '"company": "Example Labs"'
    elif change == "wrong_source":
        sources[5]["kind"] = "profile"
    elif change == "wrong_round":
        sources[6]["text"] = sources[6]["text"].replace(APP_ID, OTHER_ID)
        finding["citations"][2]["quote"] = finding["citations"][2]["quote"].replace(
            APP_ID, OTHER_ID
        )
    elif change == "wrong_metric":
        sources[4]["kind"] = "profile"
    elif change == "empty":
        coaching["records"] = []
    elif change == "index":
        coaching["records"][0]["record_citation"] = 5
    else:
        finding["coaching"] = coached_section(sources, "APPLICATION")["findings"][0][
            "coaching"
        ]
    with pytest.raises(ValueError):
        validate_section(value, sources, "PIPELINE")


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
@pytest.mark.parametrize("archive_kind", ["current", "older_prompt", "legacy"])
async def test_coaching_survives_request_checkpoint_publish_read_and_archive(
    scope, archive_kind, client, db, workspace, tmp_path, monkeypatch
):
    from app.main import app

    # Only the fixture provider is changed. Real request/validation/storage code runs.
    monkeypatch.setattr(
        interview, "canned", lambda sources: coached_section(sources, "INTERVIEW")
    )
    monkeypatch.setattr(
        scoped,
        "application_output",
        lambda sources: coached_section(sources, "APPLICATION"),
    )
    monkeypatch.setattr(
        scoped, "pipeline_output", lambda sources: coached_section(sources, "PIPELINE")
    )
    fixture = (
        interview.text_fixture()
        if scope == "INTERVIEW"
        else scoped.text_fixture(scope_expected=scope)
    )
    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    async with fixture as (endpoint, calls):
        if scope == "INTERVIEW":
            rid = await interview.setup_round(client, db, workspace, endpoint)
            state = (await client.get(f"/api/rounds/{rid}/transcript")).json()
            segments = state["transcript"]["segments"]
            segments[1].update(role="interviewer", text="What did you observe?")
            response = await client.patch(
                f"/api/rounds/{rid}/transcript",
                headers={"Expected-Transcript-Generation": "2"},
                json={"segments": segments},
            )
            assert response.status_code == 200, response.text
            path = f"/api/rounds/{rid}/interview-feedback"
        else:
            await scoped.configure(db, endpoint)
            path = (
                f"/api/applications/{workspace[4]}/feedback"
                if scope == "APPLICATION"
                else "/api/analytics/feedback"
            )
        executor = TranscriptionExecutor(sessions, tmp_path)
        monkeypatch.setattr(
            app.state, "transcription_executor", executor, raising=False
        )
        async with executor.lifespan():
            state = (await client.get(path)).json()
            body = {
                "intent_id": str(uuid4()),
                "config_revision": state["capability"]["configuration_revision"],
            }
            if scope != "PIPELINE":
                body["generation"] = state["generation"]
            else:
                body["period"] = "all"
            response = await client.post(path, json=body)
            assert response.status_code == 202, response.text
            job = await scoped.wait_state(sessions, scope=scope)
            assert job.state == "complete", job.error
        saved = (
            await client.get(path + ("?period=all" if scope == "PIPELINE" else ""))
        ).json()["report"]
        assert len(calls) == 1
        assert saved["findings"][0]["coaching"]["kind"] == scope.lower()
        assert saved["version"] == 1
        assert (
            saved["prompt_revision"]
            == job.manifest["prompt_revision"]
            == prompt_revision(scope)
        )
        if scope == "INTERVIEW":
            question = saved["findings"][0]["coaching"]["question"]
            assert any(
                s["id"] == question["source_id"] and s["role"] == "interviewer"
                for s in saved["sources"]
            )
        archive = await db.run_sync(
            lambda session: ExportService(default_registry).export_user_data(
                workspace[0].id, session
            )
        )
        model, field = {
            "INTERVIEW": ("Round", "interview_report"),
            "APPLICATION": ("Application", "report"),
            "PIPELINE": ("User", "pipeline_report"),
        }[scope]
        archived_report = archive["models"][model][0][field]
        if archive_kind == "older_prompt":
            archived_report["prompt_revision"] = "0" * 64
        elif archive_kind == "legacy":
            archived_report.pop("prompt_revision")
            for finding in archived_report["findings"]:
                finding.pop("coaching")
            cited = {
                c["source_id"]
                for f in archived_report["findings"]
                for c in f["citations"]
            }
            archived_report["sources"] = [
                s for s in archived_report["sources"] if s["id"] in cited
            ]
        await import_payload_data(
            db, workspace[1].id, deepcopy(archive), {}, lambda **kw: None
        )
        await db.commit()
        if scope == "INTERVIEW" and archive_kind != "legacy":
            restored = await db.scalar(
                select(Round)
                .join(Application)
                .where(Application.user_id == workspace[1].id)
            )
            question = restored.interview_report["findings"][0]["coaching"]["question"]
            assert question["quote"] == "What did you observe?"
            assert (
                question["source_id"]
                != saved["findings"][0]["coaching"]["question"]["source_id"]
            )
            assert any(
                s["id"] == question["source_id"]
                for s in restored.interview_report["sources"]
            )
        # A second export proves that optional fields remain valid after remapping.
        again = await db.run_sync(
            lambda session: ExportService(default_registry).export_user_data(
                workspace[1].id, session
            )
        )
        assert again["models"]["Application"]
        restored_report = again["models"][model][0][field]
        assert restored_report.get("prompt_revision") == archived_report.get(
            "prompt_revision"
        )
        assert ("prompt_revision" in restored_report) == (archive_kind != "legacy")
        assert restored_report["fingerprint"] == ""
        assert [f["action"] for f in restored_report["findings"]] == [
            f["action"] for f in archived_report["findings"]
        ]
        if archive_kind == "legacy":
            assert all("coaching" not in f for f in restored_report["findings"])
