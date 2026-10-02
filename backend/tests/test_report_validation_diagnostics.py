"""Content-free owning-site diagnostics; synthetic output is not model-quality proof."""

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from tests.test_feedback_coaching import coached_section, sample_sources
from tests.test_report_responses_protocol import (
    application_output,
    application_sources,
    responses_fixture,
    responses_payload,
    text_settings,
)

from app.services import interview_jobs as jobs
from app.services import interview_text as text

JOB_ID = "52f247a0-0fd5-4e69-a5af-1ea8cf306fbb"
SECRET = "sk-private user@example.com https://private.example/source"


@pytest.fixture
def diagnostics():
    # Attach to the canonical owning logger, independent of pytest/root log capture.
    events = []

    class Capture(logging.Handler):
        def emit(self, record):
            assert record.exc_info is None
            events.append(json.loads(record.getMessage().split(" ", 1)[1]))

    handler = Capture()
    text._validation_logger.addHandler(handler)
    try:
        yield events
    finally:
        text._validation_logger.removeHandler(handler)


@pytest.mark.parametrize(
    "change,rule,path",
    [
        ("missing", "schema.missing", ["findings", 0, "observation"]),
        ("extra", "schema.extra", ["findings", 0, "<field>"]),
        ("literal", "schema.literal", ["findings", 0, "subject"]),
        ("type", "schema.type", ["findings", 0, "observation"]),
        ("length", "schema.length", ["findings", 0, "observation"]),
        ("unknown", "reference.unknown_source", []),
        ("quote", "reference.quote_mismatch", []),
        ("subject", "reference.subject_mismatch", []),
        ("coaching", "coaching.missing", []),
    ],
)
def test_failed_rule_and_sanitized_path(diagnostics, change, rule, path):
    sources = sample_sources()
    value = coached_section(sources, "APPLICATION")
    finding = value["findings"][0]
    if change == "missing":
        del finding["observation"]
    elif change == "extra":
        finding[SECRET] = {"input": SECRET}
    elif change == "literal":
        finding["subject"] = SECRET
    elif change == "type":
        finding["observation"] = {SECRET: SECRET}
    elif change == "length":
        finding["observation"] = SECRET * 100
    elif change == "unknown":
        finding["citations"][0]["source_id"] = SECRET
    elif change == "quote":
        finding["citations"][0]["quote"] = SECRET
    elif change == "subject":
        finding["subject"] = "pipeline"
    else:
        del finding["coaching"]
    with text.validation_context(JOB_ID, "APPLICATION", 2):
        with pytest.raises(ValueError):
            text.validate_section(
                value, sources, "APPLICATION", require_current_contract=True
            )
    expected = {
        "rule": rule,
        "path": path,
        "job_id": JOB_ID,
        "scope": "APPLICATION",
        "section_index": 2,
    }
    code = {
        "missing": "missing",
        "extra": "extra_forbidden",
        "literal": "literal_error",
        "type": "string_type",
        "length": "string_too_long",
    }.get(change)
    if code:
        expected["code"] = code
    if change in ("subject", "literal"):
        expected["subject"] = "pipeline" if change == "subject" else "<unknown>"
        expected["finding_index"] = 0
    assert diagnostics == [expected]
    assert SECRET not in json.dumps(diagnostics)


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
def test_current_and_legacy_valid_remain_silent(scope, diagnostics):
    sources = sample_sources()
    value = coached_section(sources, scope)
    text.validate_section(value, sources, scope, require_current_contract=True)
    del value["findings"][0]["coaching"]
    text.validate_section(value, sources, scope)
    assert diagnostics == []


def test_complete_record_and_legitimate_fallback(diagnostics):
    sources = sample_sources()
    value = coached_section(sources, "PIPELINE")
    text.validate_section(value, sources, "PIPELINE", require_current_contract=True)
    finding = value["findings"][0]
    del finding["coaching"]
    finding["coaching_unavailable"] = "complete_record_unavailable"
    finding["citations"] = finding["citations"][:1]
    incomplete_sources = [s for s in sources if s["kind"] != "pipeline_record"]
    text.validate_section(
        value, incomplete_sources, "PIPELINE", require_current_contract=True
    )
    with pytest.raises(ValueError):
        text.validate_section(value, sources, "PIPELINE", require_current_contract=True)
    assert diagnostics[-1]["rule"] == "coaching.missing"


def test_record_context_is_not_reconstructed(diagnostics):
    sources = sample_sources()
    value = coached_section(sources, "PIPELINE")
    citation = value["findings"][0]["citations"][1]
    citation["quote"] = '"company": "Example Labs"'
    with pytest.raises(ValueError):
        text.validate_section(value, sources, "PIPELINE", require_current_contract=True)
    assert diagnostics[-1]["rule"] == "schema.parse"
    citation["quote"] = "{}"
    sources[5]["text"] = "{}"
    with pytest.raises(ValueError):
        text.validate_section(value, sources, "PIPELINE", require_current_contract=True)
    assert diagnostics[-1]["rule"] == "pipeline.record_context"


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_both_provider_paths_log_before_safe_failure(protocol, diagnostics):
    mode = "responses" if protocol == "responses" else "chat"
    async with responses_fixture(foreign=True, mode=mode) as (endpoint, calls):
        with text.validation_context(JOB_ID, "APPLICATION", 0):
            with pytest.raises(text.ReportFailure) as error:
                await text.analyze_section(
                    text_settings(endpoint, protocol),
                    application_sources(),
                    [],
                    "APPLICATION",
                    session_id=JOB_ID,
                )
    assert error.value.category == "report_grounding"
    assert len(calls) == 1
    assert diagnostics == [
        {
            "rule": "reference.unknown_source",
            "path": [],
            "job_id": JOB_ID,
            "scope": "APPLICATION",
            "section_index": 0,
        }
    ]


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
@pytest.mark.parametrize(
    "change,rule,category",
    [
        ("parse", "schema.parse", "provider_response_invalid"),
        ("extra", "schema.extra", "report_grounding"),
        ("coaching", "coaching.missing", "report_grounding"),
    ],
)
async def test_provider_parse_schema_and_coaching_sites(
    protocol, change, rule, category, diagnostics
):
    sources = application_sources()
    section = application_output(sources)
    if change == "extra":
        section["findings"][0][SECRET] = SECRET
    elif change == "coaching":
        del section["findings"][0]["coaching"]
    content = '{"findings":' if change == "parse" else json.dumps(section)
    if protocol == "responses":
        envelope = json.loads(responses_payload(sources))
        envelope["output"][0]["content"][0]["text"] = content
    else:
        envelope = {
            "choices": [{"finish_reason": "stop", "message": {"content": content}}]
        }
    async with responses_fixture(body=json.dumps(envelope).encode()) as (
        endpoint,
        calls,
    ):
        with pytest.raises(text.ReportFailure) as error:
            await text.analyze_section(
                text_settings(endpoint, protocol),
                sources,
                [],
                "APPLICATION",
                session_id=JOB_ID,
            )
    assert error.value.category == category
    assert len(calls) == 1
    assert len(diagnostics) == 1
    assert diagnostics[0]["rule"] == rule
    assert SECRET not in json.dumps(diagnostics)


async def test_checkpoint_revalidation_keeps_old_safe_banner(monkeypatch, diagnostics):
    job = SimpleNamespace(
        uncertain=True, checkpoints=[], total_sections=1, scope="APPLICATION"
    )
    monkeypatch.setattr(jobs, "guard", AsyncMock(return_value=(job, None, None)))
    sources = sample_sources()
    value = coached_section(sources, "APPLICATION")
    del value["findings"][0]["coaching"]
    with pytest.raises(text.ReportFailure) as error:
        await jobs.checkpoint(None, JOB_ID, None, 0, value, sources)
    assert error.value.safe_message == text.SAFE_FAILURE_MESSAGES["report_grounding"]
    assert diagnostics[-1]["rule"] == "coaching.missing"
    assert diagnostics[-1]["section_index"] == 0
    assert job.checkpoints == [] and job.uncertain


async def test_checkpoint_bound(monkeypatch, diagnostics):
    job = SimpleNamespace(
        uncertain=True,
        checkpoints=[{"padding": "x" * 750000}],
        total_sections=2,
        scope="APPLICATION",
    )
    monkeypatch.setattr(jobs, "guard", AsyncMock(return_value=(job, None, None)))
    with pytest.raises(text.ReportFailure):
        await jobs.checkpoint(
            None, JOB_ID, None, 1, {"findings": [], "limitations": []}, []
        )
    assert diagnostics[-1]["rule"] == "bounds.checkpoints"


async def test_publication_bounds(monkeypatch, diagnostics):
    job = SimpleNamespace(
        uncertain=True, total_sections=1, checkpoints=[], scope="PIPELINE"
    )
    monkeypatch.setattr(jobs, "guard", AsyncMock(return_value=(job, None, None)))
    with pytest.raises(ValueError):
        await jobs.publish(None, JOB_ID, None, [], [])
    assert diagnostics[-1]["rule"] == "bounds.publication_incomplete"
    job.uncertain = False
    job.checkpoints = [{"findings": [], "limitations": ["x" * 1000001]}]
    job.provider = "openai"
    job.model = "synthetic"
    job.config_revision = "fixed"
    job.manifest = {"prompt_revision": "fixed"}
    job.fingerprint = "fixed"
    with pytest.raises(ValueError):
        await jobs.publish(None, JOB_ID, None, [], [])
    assert diagnostics[-1]["rule"] == "bounds.publication"


def test_unknown_error_and_untrusted_context(diagnostics):
    with text.validation_context(SECRET, SECRET, SECRET):
        text.log_validation_failure(ValueError(SECRET), SECRET)
    assert diagnostics == [
        {"rule": "unknown_validation", "path": [], "job_id": None, "scope": None}
    ]


def test_nested_extra_key_never_logged(diagnostics):
    value = coached_section(sample_sources(), "PIPELINE")
    value["findings"][0]["coaching"]["records"][0][SECRET] = SECRET
    with pytest.raises(ValueError):
        text.validate_section(
            value, sample_sources(), "PIPELINE", require_current_contract=True
        )
    assert diagnostics[-1]["path"] == [
        "findings",
        0,
        "coaching",
        "pipeline",
        "records",
        0,
        "<field>",
    ]
    assert SECRET not in json.dumps(diagnostics)
