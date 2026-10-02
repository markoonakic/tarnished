"""Real source serialization and citation selection; no live model-quality claim."""

import json
import logging
from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_feedback_contract import admitted, envelope
from tests.test_report_responses_protocol import responses_fixture, text_settings

from app.models import InterviewJob
from app.services import interview_jobs as jobs
from app.services import interview_text as text
from app.services.interview_evidence import pipeline_evidence_sources, pipeline_sections
from app.services.transcription_executor import TranscriptionExecutor

APP_KEYS = {
    "application_id",
    "company",
    "role",
    "source",
    "current_stage",
    "stage_at_report_date",
    "applied_at",
    "history_incomplete",
}
ROUND_KEYS = {
    "application_id",
    "round_type",
    "outcome",
    "scheduled_at",
    "completed_at",
}
APP_ID = "11111111-1111-4111-8111-111111111111"


async def built_sources():
    return (
        await pipeline_evidence_sources(
            {
                "profile": {},
                "metrics": {
                    "total_applications": 20,
                    "applications": [
                        {
                            "application_id": APP_ID if index == 0 else str(uuid4()),
                            "company": 'Example {Labs} "é"',
                            "job_title": "Engineer",
                            "source": None,
                            "current_meaning": "screening",
                            "as_of_meaning": "applied",
                            "applied_at": "2026-09-25",
                            "missing_prefix": True,
                        }
                        for index in range(20)
                    ],
                    "rounds": [
                        {
                            "application_id": APP_ID,
                            "round_type": "Technical",
                            "outcome": None,
                            "scheduled_at": "2026-09-29T09:00:00+00:00",
                            "completed_at": None,
                        }
                    ],
                },
            }
        )
    )[0]


def exact_record(sources, prefix, keys, identity=APP_ID):
    # Take bytes from a single supplied chunk, not a reserialized/rebuilt object.
    decoder = json.JSONDecoder()
    for source in sources:
        if not source["id"].startswith(prefix):
            continue
        for start, char in enumerate(source["text"]):
            if char != "{":
                continue
            try:
                value, end = decoder.raw_decode(source["text"], start)
            except ValueError:
                continue
            if (
                isinstance(value, dict)
                and set(value) == keys
                and value["application_id"] == identity
            ):
                return {"source_id": source["id"], "quote": source["text"][start:end]}
    raise AssertionError("Expected a complete object in a single builder chunk")


def section_for(sources):
    metric = next(s for s in sources if s["id"] == "pipeline:metrics:0")
    return {
        "findings": [
            {
                "subject": "pipeline",
                "topic": "activity",
                "observation": "The supplied application has an unconfirmed interview result.",
                "interpretation": "A scheduled date does not establish attendance or an outcome.",
                "action": "Check your own notes before choosing the next step.",
                "limitations": "Attendance and the last substantive message are unknown.",
                "citations": [
                    {"source_id": metric["id"], "quote": metric["text"]},
                    exact_record(sources, "pipeline:recorded_approaches:", APP_KEYS),
                    exact_record(sources, "pipeline:rounds:", ROUND_KEYS),
                ],
                "coaching": {
                    "version": 1,
                    "kind": "pipeline",
                    "title": "Check the recorded result",
                    "records": [
                        {
                            "record_citation": 1,
                            "round_citations": [2],
                            "condition": "If your own notes confirm that this was a real interview",
                            "action": "Record attendance and any known result; leave unavailable outcomes unknown.",
                        }
                    ],
                },
            }
        ],
        "limitations": [],
    }


async def test_prompt_record_spec_matches_real_builder_and_validator():
    sources = await built_sources()
    # The request contract must describe the actual inner records, not wrappers.
    prompt = text._system_prompt("PIPELINE", current_date="2026-09-30")
    spec, _ = json.JSONDecoder().raw_decode(
        prompt.split("Record citation contract: ", 1)[1]
    )
    expected = {
        "record_citation": ("pipeline:recorded_approaches:", APP_KEYS, "applications"),
        "round_citations": ("pipeline:rounds:", ROUND_KEYS, "rounds"),
    }
    for field, (prefix, keys, array) in expected.items():
        assert spec[field]["source_kind"] == "pipeline_record"
        assert spec[field]["source_id_prefix"] == prefix
        assert set(spec[field]["object_keys"]) == keys
        assert spec[field]["array_element"] == array
        citation = exact_record(sources, prefix, keys)
        record = json.loads(citation["quote"])
        assert set(record) == keys
    assert any(s["offset"] == 4000 for s in sources if s["kind"] == "pipeline_record")
    for batch in pipeline_sections(sources):
        # This fixture fits one request, including real chunked sources.
        result = text.validate_section(
            section_for(batch), batch, "PIPELINE", require_current_contract=True
        )
        assert result == section_for(batch)
        assert (
            json.loads(result["findings"][0]["citations"][2]["quote"])["outcome"]
            is None
        )


@pytest.mark.parametrize("kind,index", [("application", 1), ("round", 2)])
@pytest.mark.parametrize(
    "shape",
    [
        "wrapper",
        "array",
        "scalar",
        "partial",
        "missing_keys",
        "extra_keys",
        "missing_and_extra_keys",
    ],
)
async def test_bad_record_selections_fail_closed_with_content_free_shape(
    kind, index, shape
):
    sources = await built_sources()
    section = section_for(sources)
    citation = section["findings"][0]["citations"][index]
    source = next(s for s in sources if s["id"] == citation["source_id"])
    record = json.loads(citation["quote"])
    if shape == "wrapper":
        # Round wrapper is wholly present; application wrapper is genuinely chunked.
        if kind == "application":
            source["text"] = json.dumps({"applications": [record]})
        quote = source["text"]
        code = "missing_and_extra_keys"
    elif shape == "array":
        quote = json.dumps([record])
        source["text"] = json.dumps(
            {"applications" if kind == "application" else "rounds": [record]}
        )
        code = "not_object"
    elif shape == "scalar":
        quote = json.dumps(APP_ID)
        code = "not_object"
    elif shape == "partial":
        quote = '"application_id": ' + json.dumps(APP_ID)
        code = None  # Exact source fragment, but not standalone JSON.
    else:
        if shape in ("missing_keys", "missing_and_extra_keys"):
            record.pop("company" if kind == "application" else "outcome")
        if shape in ("extra_keys", "missing_and_extra_keys"):
            record["private@example.invalid"] = "sk-private do not log"
        quote = json.dumps(record)
        source["text"] += "\n" + quote
        code = shape
    citation["quote"] = quote
    assert quote in source["text"]  # Reject at the record boundary, not quote mismatch.
    events = []

    class Capture(logging.Handler):
        def emit(self, event):
            assert event.exc_info is None
            events.append(json.loads(event.getMessage().split(" ", 1)[1]))

    handler = Capture()
    text._validation_logger.addHandler(handler)
    try:
        with pytest.raises(ValueError):
            text.validate_section(
                section, sources, "PIPELINE", require_current_contract=True
            )
    finally:
        text._validation_logger.removeHandler(handler)
    assert len(events) == 1
    assert events[0]["rule"] == ("pipeline.record_context" if code else "schema.parse")
    if code:
        assert events[0]["record_kind"] == kind
        assert events[0]["code"] == code
    assert "private@example.invalid" not in json.dumps(events)
    assert "sk-private" not in json.dumps(events)


async def test_exact_quote_cannot_borrow_a_complete_record_from_unrelated_source():
    sources = await built_sources()
    section = section_for(sources)
    citation = section["findings"][0]["citations"][1]
    metric = next(s for s in sources if s["id"] == "pipeline:metrics:0")
    metric["text"] += "\n" + citation["quote"]
    citation["source_id"] = metric["id"]
    with pytest.raises(text.SectionValidationError) as exc:
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
    assert exc.value.rule == text.ValidationRule.RECORD_SOURCE
    citation["source_id"] = "pipeline:recorded_approaches:999999"
    with pytest.raises(text.SectionValidationError) as exc:
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
    assert exc.value.rule == text.ValidationRule.UNKNOWN_SOURCE


async def test_real_split_chunk_requires_explicit_fallback_not_named_record_reconstruction():
    sources = await built_sources()
    section = section_for(sources)
    finding = section["findings"][0]
    finding.pop("coaching")
    finding["coaching_unavailable"] = "complete_record_unavailable"
    finding["citations"] = finding["citations"][:1]
    with pytest.raises(text.SectionValidationError) as exc:
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
    assert exc.value.rule == text.ValidationRule.COACHING_MISSING
    record_source = next(
        s for s in sources if s["id"] == "pipeline:recorded_approaches:0"
    )
    quote = exact_record(sources, "pipeline:recorded_approaches:", APP_KEYS)["quote"]
    split = quote.index('"company"')
    no_complete_record = [s for s in sources if s["kind"] != "pipeline_record"] + [
        {**record_source, "text": quote[:split]},
        {
            **record_source,
            "id": "pipeline:recorded_approaches:4000",
            "offset": 4000,
            "text": quote[split:],
        },
    ]
    result = text.validate_section(
        section, no_complete_record, "PIPELINE", require_current_contract=True
    )
    assert result == section
    assert "coaching" not in result["findings"][0]


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
@pytest.mark.parametrize("selection", ["complete", "round_wrapper", "scalar"])
async def test_real_source_wire_prompt_and_record_parser(protocol, selection):
    sources = await built_sources()
    section = section_for(sources)
    if selection != "complete":
        citation = section["findings"][0]["citations"][2]
        source = next(s for s in sources if s["id"] == citation["source_id"])
        citation["quote"] = (
            source["text"] if selection == "round_wrapper" else json.dumps(APP_ID)
        )
        assert citation["quote"] in source["text"]
    async with responses_fixture(body=envelope(section, protocol)) as (endpoint, calls):
        if selection == "complete":
            result = await text.analyze_section(
                text_settings(endpoint, protocol), sources, [], "PIPELINE"
            )
            assert result == section
        else:
            with pytest.raises(text.ReportFailure) as exc:
                await text.analyze_section(
                    text_settings(endpoint, protocol), sources, [], "PIPELINE"
                )
            assert exc.value.category == "report_grounding"
    assert len(calls) == 1
    request = calls[0][1]
    prompt = (
        request["instructions"]
        if protocol == "responses"
        else request["messages"][0]["content"]
    )
    user_input = (
        request["input"]
        if protocol == "responses"
        else request["messages"][1]["content"]
    )
    assert json.loads(user_input) == {"sources": sources, "limitations": []}
    spec, _ = json.JSONDecoder().raw_decode(
        prompt.split("Record citation contract: ", 1)[1]
    )
    for field, index in (("record_citation", 1), ("round_citations", 2)):
        citation = section_for(sources)["findings"][0]["citations"][index]
        source = next(
            s
            for s in json.loads(user_input)["sources"]
            if s["id"] == citation["source_id"]
        )
        assert source["kind"] == spec[field]["source_kind"]
        assert source["id"].startswith(spec[field]["source_id_prefix"])
        assert set(json.loads(citation["quote"])) == set(spec[field]["object_keys"])


@pytest.mark.parametrize(
    "scope,state",
    [
        ("PIPELINE", "failed"),
        ("PIPELINE", "invalidated"),
        ("APPLICATION", "failed"),
        ("INTERVIEW", "failed"),
    ],
)
async def test_failure_retains_only_pipeline_request_context(
    scope, state, client, db, workspace, monkeypatch
):
    _, job, _, _ = await admitted(scope, client, db, workspace, monkeypatch)
    claim = str(uuid4())
    job.state, job.claim_id, job.uncertain = "analyzing", claim, True
    before = deepcopy(job.manifest)
    job.manifest = {
        **before,
        "sources": [{"text": "private source"}],
        "untrusted": "private body",
    }
    job.checkpoints = [{"private": "private rejected output"}]
    await db.commit()
    executor = TranscriptionExecutor(
        async_sessionmaker(db.bind, expire_on_commit=False)
    )
    await executor.finish_failure(
        job.id,
        claim,
        state,
        interview=True,
        error=text.SAFE_FAILURE_MESSAGES["report_grounding"],
    )
    retained = await db.get(InterviewJob, job.id, populate_existing=True)
    assert retained.state == state and retained.uncertain
    assert retained.checkpoints == []
    expected = (
        {k: before[k] for k in ("period", "as_of", "time_zone", "prompt_revision")}
        if (scope, state) == ("PIPELINE", "failed")
        else {}
    )
    assert retained.manifest == expected
    assert retained.error == text.SAFE_FAILURE_MESSAGES["report_grounding"]
    assert jobs.status(retained)["prompt_revision"] == expected.get("prompt_revision")
