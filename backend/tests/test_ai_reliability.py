"""Demo-scale source contracts. Provider output is synthetic, not a live quality test."""

import json
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_feedback_contract import admitted, envelope
from tests.test_report_responses_protocol import responses_fixture, text_settings

from app.models import InterviewJob, Round
from app.schemas.interview_feedback import (
    ApplicationOutputSection,
    InterviewOutputSection,
    PipelineOutputSection,
)
from app.schemas.job_analysis import CATEGORIES, Extraction
from app.services import interview_jobs as jobs
from app.services import interview_text as text
from app.services.interview_archive import _verify_report_sources
from app.services.interview_evidence import (
    _append_records,
    _append_source,
    application_sections,
    pipeline_evidence_sources,
    pipeline_sections,
    sections,
)
from app.services.job_analyses import prompt, validate_output


async def test_209_enriched_records_are_compact_atomic_deterministic_and_citable():
    data = {
        "profile": {},
        "metrics": {
            "total_applications": 209,
            "applications": [
                {
                    "application_id": str(UUID(int=index + 1)),
                    "company": '\\"\nCompany' * 500,
                    "job_title": "Engineer Ž" * 500,
                    "source": "Referral" * 500,
                    "current_meaning": "screening",
                    "as_of_meaning": "applied",
                    "applied_at": "2026-09-25",
                    "missing_prefix": True,
                    "notes": "omitted-private-notes" * 1000,
                    "contacts": [{"email": "omitted-private-contact"}],
                    "rounds": [{"transcript": "omitted-private-transcript" * 4000}],
                    "job_description": "omitted-private-description" * 4000,
                }
                for index in range(209)
            ],
            "rounds": [
                {
                    "application_id": str(UUID(int=index + 1)),
                    "round_type": "Technical" * 500,
                    "outcome": None,
                    "scheduled_at": "2026-09-29T09:00:00+00:00",
                    "completed_at": None,
                }
                for index in range(209)
            ],
        },
    }
    sources, limits = await pipeline_evidence_sources(data)
    assert (sources, limits) == await pipeline_evidence_sources(data)
    assert "omitted-private" not in json.dumps(sources)
    seen = []
    for source in sources:
        if source["kind"] != "pipeline_record":
            continue
        assert len(source["text"]) <= 4000
        for array, records in json.loads(source["text"]).items():
            for record in records:
                quote = json.dumps(record, ensure_ascii=False)
                assert len(quote) <= 2000
                assert quote in source["text"]
                if array == "applications":
                    seen.append(record["application_id"])
                    assert record["company"].endswith("…")
    assert len(seen) == len(set(seen)) == 209
    batches = pipeline_sections(sources)
    assert len(batches) > 1
    for batch in batches:
        assert sum(len(source["text"]) for source in batch) <= 36000
        assert all(source in sources for source in batch)
        metric = next(s for s in batch if s["id"] == "pipeline:metrics:0")
        record_source = next(
            s for s in batch if s["id"].startswith("pipeline:recorded_approaches:")
        )
        record = json.loads(record_source["text"])["applications"][0]
        round_ids = {
            r["application_id"]
            for source in batch
            if source["id"].startswith("pipeline:rounds:")
            for r in json.loads(source["text"])["rounds"]
        }
        if round_ids:
            application_ids = {
                r["application_id"]
                for source in batch
                if source["id"].startswith("pipeline:recorded_approaches:")
                for r in json.loads(source["text"])["applications"]
            }
            assert round_ids.intersection(application_ids)
        quote = json.dumps(record, ensure_ascii=False)
        section = {
            "findings": [
                {
                    "subject": "pipeline",
                    "topic": "activity",
                    "observation": "This is an example of the recorded pipeline.",
                    "interpretation": "Incomplete history leaves attendance unknown.",
                    "action": "Check your own notes before choosing a next step.",
                    "limitations": "These are examples, not the full affected set.",
                    "citations": [
                        {
                            "source_id": metric["id"],
                            "quote": '"total_applications": 209',
                        },
                        {"source_id": record_source["id"], "quote": quote},
                    ],
                    "coaching": {
                        "version": 1,
                        "kind": "pipeline",
                        "title": "Check records",
                        "records": [
                            {
                                "record_citation": 1,
                                "round_citations": [],
                                "condition": "If your own notes confirm attendance",
                                "action": "Record the known result.",
                            }
                        ],
                    },
                }
            ],
            "limitations": [],
        }
        assert (
            text.validate_section(
                section, batch, "PIPELINE", require_current_contract=True
            )
            == section
        )
        section["findings"][0]["citations"][1]["quote"] = quote.replace(
            "Engineer", "Invented", 1
        )
        with pytest.raises(ValueError):
            text.validate_section(
                section, batch, "PIPELINE", require_current_contract=True
            )


async def test_old_pipeline_source_packing_can_be_verified_locally_without_changing_new_requests():
    data = {
        "profile": {},
        "metrics": {
            "applications": [
                {
                    "application_id": str(UUID(int=index + 1)),
                    "company": "Example",
                    "job_title": "Engineer",
                    "source": "Referral",
                    "current_meaning": "applied",
                    "applied_at": "2026-09-25",
                }
                for index in range(20)
            ]
        },
    }
    current, _ = await pipeline_evidence_sources(data)
    legacy, _ = await pipeline_evidence_sources(data, compact_records=False)
    assert current != legacy
    candidates = [
        {source["id"]: source["text"] for source in variant}
        for variant in (current, legacy)
    ]
    _verify_report_sources({"sources": legacy}, candidates)
    _verify_report_sources({"sources": current}, candidates)
    changed = [{**legacy[0], "text": legacy[0]["text"] + "changed"}]
    with pytest.raises(ValueError):
        _verify_report_sources({"sources": changed}, candidates)
    assert (await pipeline_evidence_sources(data))[0] == current


def test_record_source_offsets_fail_before_the_archive_bound(monkeypatch):
    monkeypatch.setattr("app.services.interview_evidence.MAX_SOURCE_CHARS", 2000)
    record = dict.fromkeys(
        (
            "company",
            "role",
            "source",
            "current_stage",
            "stage_at_report_date",
            "applied_at",
        ),
        "\\n" * 1000,
    )
    record.update(application_id=str(UUID(int=1)), history_incomplete=True)
    with pytest.raises(HTTPException) as error:
        _append_records(
            [], "pipeline:recorded_approaches", "applications", [record] * 10
        )
    assert error.value.status_code == 422
    assert "offsets" in error.value.detail


@pytest.mark.parametrize(
    "scope,model",
    [
        ("INTERVIEW", InterviewOutputSection),
        ("APPLICATION", ApplicationOutputSection),
        ("PIPELINE", PipelineOutputSection),
    ],
)
def test_provider_schema_exposes_validator_limits(scope, model):
    schema = model.model_json_schema()
    assert schema["properties"]["limitations"]["items"]["maxLength"] == 1200
    assert "2000 characters" in text._system_prompt(scope)
    if scope == "APPLICATION":
        finding = schema["$defs"]["ApplicationOutputFinding"]
        assert finding["properties"]["subject"]["const"] == "application"
        assert finding["properties"]["coaching"]["$ref"].endswith("ApplicationCoaching")
        assert "coaching" in finding["required"]
    if scope == "PIPELINE":
        assert "at most six example records" in text._system_prompt(scope)
        assert "sixteen-citation budget" in text._system_prompt(scope)
        assert "List every affected record" not in text._system_prompt(scope)


def test_long_transcript_sections_keep_original_question_requirement_and_dates():
    sources = []
    _append_source(
        sources, "requirement:job", "requirement", "Explain your Python experience."
    )
    _append_source(sources, "round:example:scheduled_at", "round", "2026-09-29")
    _append_source(
        sources,
        "transcript:question",
        "transcript",
        "How did you check your result?",
        role="interviewer",
    )
    _append_source(
        sources,
        "transcript:answer",
        "transcript",
        "I checked the result. " * 4000,
        role="candidate",
    )
    batches = sections(sources)
    assert len(batches) > 1
    for batch in batches:
        assert sources[0] in batch and sources[1] in batch and sources[2] in batch
        assert all(source in sources for source in batch)
        assert sum(len(source["text"]) for source in batch) <= 36000
    assert any(
        s["offset"] > 0
        for batch in batches
        for s in batch
        if s.get("role") == "candidate"
    )
    assert all(
        sources[0] in batch and sources[1] in batch
        for batch in application_sections(sources)
    )


@pytest.mark.parametrize("kind", ["EXTRACTION", "PROFILE_MATCH", "PREPARATION"])
def test_long_sources_use_bounded_exact_passages_in_all_review_scopes(kind):
    data = {
        "posting": "Python is required. " * 5000,
        "requirements": [{"id": f"r-{i}", "text": "Python"} for i in range(100)],
        "profile": [
            {"id": "experience", "text": "I checked the Python result. " * 3000}
        ],
    }
    if kind == "EXTRACTION":
        output = {
            "items": [
                {
                    "id": f"item-{i}",
                    "field": "must_have",
                    "value": "Python",
                    "quote": "Python is required.",
                }
                for i in range(100)
            ]
        }
        assert (
            Extraction.model_json_schema()["$defs"]["Proposal"]["properties"]["value"][
                "anyOf"
            ][0]["maxLength"]
            == 4000
        )
        assert "seniority at most 50" in prompt(kind)
    elif kind == "PROFILE_MATCH":
        output = {
            "rows": [
                {
                    "requirement_id": item["id"],
                    "state": "confirmed",
                    "evidence": [
                        {
                            "profile_id": "experience",
                            "quote": "I checked the Python result.",
                        }
                    ],
                    "why": "Saved experience mentions Python.",
                }
                for item in data["requirements"]
            ]
        }
    else:
        output = {category: [] for category in CATEGORIES}
        output["examples"] = [
            {
                "id": "example",
                "text": "Practice explaining your recorded check.",
                "requirement_ids": ["r-0"],
                "evidence": [
                    {
                        "profile_id": "experience",
                        "quote": "I checked the Python result.",
                    }
                ],
            }
        ]
    assert "100000 UTF-8 bytes" in prompt(kind)
    assert len(json.dumps(output).encode()) < 100000
    assert validate_output(output, [{"data": data}], kind) == output
    if kind == "EXTRACTION":
        output["items"][0]["quote"] = data["posting"][:2001]
    elif kind == "PROFILE_MATCH":
        output["rows"][0]["evidence"][0]["quote"] = data["profile"][0]["text"][:2001]
    else:
        output["examples"][0]["evidence"][0]["quote"] = data["profile"][0]["text"][
            :2001
        ]
    with pytest.raises(ValueError):
        validate_output(output, [{"data": data}], kind)


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
async def test_oversized_retained_snapshot_fails_before_dispatch(scope):
    if scope == "PIPELINE":
        data = {
            "profile": {},
            "metrics": {"coverage": {"note": "x" * 800000}},
        }
    else:
        data = {
            "application_id": str(uuid4()),
            "application": {"job_description": "Python is required."},
            "history": [],
            "profile": {},
            "documents": {},
        }
        if scope == "APPLICATION":
            from app.services.interview_evidence import ROUND_FIELDS

            data["rounds"] = [
                {
                    "id": str(uuid4()),
                    **dict.fromkeys(ROUND_FIELDS),
                    "notes_summary": "x" * 64000,
                }
                for _ in range(13)
            ]
        else:
            data["round_id"] = str(uuid4())
            from app.services.interview_evidence import ROUND_FIELDS

            data["round"] = {
                **dict.fromkeys(ROUND_FIELDS),
                "current_transcript": {
                    "coverage": "partial",
                    "segments": [
                        {"id": str(uuid4()), "role": "candidate", "text": "x" * 64000}
                        for _ in range(13)
                    ],
                },
            }
    with pytest.raises(HTTPException) as error:
        await jobs._scope_evidence(scope, data)
    assert error.value.status_code == 422
    assert "retained report bounds" in error.value.detail


async def test_large_transcript_is_rejected_at_admission_without_a_new_job(
    client, db, workspace, monkeypatch
):
    path, old_job, _, _ = await admitted(
        "INTERVIEW", client, db, workspace, monkeypatch
    )
    old_job.state = "failed"
    interview = await db.get(Round, old_job.round_id)
    transcript = dict(interview.current_transcript)
    transcript["segments"] = [
        {"id": str(uuid4()), "role": "candidate", "text": "x" * 64000}
        for _ in range(13)
    ]
    interview.current_transcript = transcript
    await db.commit()
    state = (await client.get(path)).json()
    intent = str(uuid4())
    response = await client.post(
        path,
        json={
            "intent_id": intent,
            "generation": state["generation"],
            "config_revision": state["capability"]["configuration_revision"],
        },
    )
    assert response.status_code == 422, response.text
    assert "retained report bounds" in response.text
    from sqlalchemy import select

    assert (
        await db.scalar(select(InterviewJob.id).where(InterviewJob.intent_id == intent))
        is None
    )


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_complete_100_row_matrix_has_output_headroom_on_both_transports(protocol):
    data = {
        "requirements": [{"id": f"r-{index}"} for index in range(100)],
        "profile": [],
    }
    output = {
        "rows": [
            {
                "requirement_id": item["id"],
                "state": "unknown",
                "evidence": [],
                "why": "The saved profile does not contain enough detail to check this requirement. Missing saved evidence does not mean that you lack the ability.",
            }
            for item in data["requirements"]
        ]
    }
    assert len(json.dumps(output).encode()) > 16000
    async with responses_fixture(body=envelope(output, protocol)) as (endpoint, calls):
        result = await text.analyze_section(
            text_settings(endpoint, protocol),
            [{"id": "saved-input", "data": data}],
            [],
            "PROFILE_MATCH",
        )
    assert result == output and len(calls) == 1
    budget = "max_output_tokens" if protocol == "responses" else "max_tokens"
    assert calls[0][1][budget] == 32000
