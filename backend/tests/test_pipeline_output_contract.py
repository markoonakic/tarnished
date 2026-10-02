"""Execute the actual scoped provider contract; no live model-quality claim."""

import json
from copy import deepcopy

import pytest
from jsonschema import Draft202012Validator
from tests.test_feedback_contract import envelope
from tests.test_pipeline_record_contract import built_sources, section_for
from tests.test_report_responses_protocol import responses_fixture, text_settings
from tests.test_report_validation_diagnostics import diagnostics as diagnostics

from app.schemas import interview_feedback as schemas
from app.services import interview_text as text


def emitted_schema(prompt):
    # The canonical Pydantic schema is the final JSON object in the instructions.
    return json.loads('{"$defs":' + prompt.rsplit('{"$defs":', 1)[1])


def provider_validator(prompt=None):
    schema = emitted_schema(prompt or text._system_prompt("PIPELINE"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def test_scoped_schema_reuses_models_and_has_only_resolvable_pipeline_definitions():
    schema = emitted_schema(text._system_prompt("PIPELINE"))
    assert schema == schemas.PipelineOutputSection.model_json_schema()
    defs = schema["$defs"]
    finding = defs["PipelineOutputFinding"]["properties"]
    assert finding["subject"]["const"] == "pipeline"
    assert finding["topic"]["anyOf"][0]["enum"] == ["pipeline", "interview", "activity"]
    assert finding["coaching"]["anyOf"] == [
        {"$ref": "#/$defs/PipelineCoaching"},
        {"type": "null"},
    ]
    assert not {"InterviewCoaching", "ApplicationCoaching", "ConditionalDraft"} & set(
        defs
    )
    refs = set()

    def check_refs(value):
        if isinstance(value, dict):
            if "$ref" in value:
                ref = value["$ref"]
                assert ref.startswith("#/$defs/")
                name = ref.removeprefix("#/$defs/")
                assert name in defs
                refs.add(name)
            for item in value.values():
                check_refs(item)
        elif isinstance(value, list):
            for item in value:
                check_refs(item)

    check_refs(schema)
    assert refs == set(defs)  # No leftover unrelated coaching definitions.
    # Existing saved/report/archive schemas retain their original scope union.
    old = schemas.PipelineSection.model_json_schema()["$defs"]["PipelineFinding"]
    assert old["properties"]["subject"]["enum"] == ["application", "pipeline"]
    assert "ApplicationCoaching" in schemas.PipelineSection.model_json_schema()["$defs"]


@pytest.mark.parametrize("topic", ["pipeline", "interview", "activity"])
async def test_all_topics_are_pipeline_subject_with_complete_records(topic):
    sources = await built_sources()
    section = section_for(sources)
    section["findings"][0]["topic"] = topic
    provider_validator().validate(section)
    assert (
        schemas.PipelineOutputSection.model_validate(section).model_dump(
            exclude_none=True
        )
        == section
    )
    assert (
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
        == section
    )


@pytest.mark.parametrize(
    "subject", ["application", "candidate", "private@example.invalid"]
)
async def test_wrong_subject_rejected_not_coerced_and_safe_diagnostic(
    subject, diagnostics
):
    sources = await built_sources()
    section = section_for(sources)
    section["findings"].append(deepcopy(section["findings"][0]))
    section["findings"][1]["subject"] = subject
    with pytest.raises(ValueError):
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
    event = diagnostics[-1]
    assert event["subject"] == (
        subject if subject in ("application", "candidate") else "<unknown>"
    )
    assert event["finding_index"] == 1
    assert event["rule"] == (
        "reference.subject_mismatch" if subject == "application" else "schema.literal"
    )
    assert section["findings"][1]["subject"] == subject
    assert "private@example.invalid" not in json.dumps(diagnostics)
    assert list(provider_validator().iter_errors(section))
    with pytest.raises(ValueError):
        schemas.PipelineOutputSection.model_validate(section)


@pytest.mark.parametrize("kind", ["application", "interview"])
async def test_provider_schema_does_not_offer_other_coaching(kind):
    sources = await built_sources()
    section = section_for(sources)
    section["findings"][0]["coaching"] = (
        {
            "version": 1,
            "kind": "application",
            "title": "Check context",
            "context_citations": [1],
            "branches": [
                {"condition": "If your notes confirm it", "action": "Check your notes."}
            ],
        }
        if kind == "application"
        else {
            "version": 1,
            "kind": "interview",
            "title": "Practice",
            "answer_citation": 1,
            "better_answer": "[Supported answer]",
        }
    )
    assert list(provider_validator().iter_errors(section))
    with pytest.raises(ValueError):
        schemas.PipelineOutputSection.model_validate(section)
    with pytest.raises(ValueError):
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )


async def test_provider_schema_preserves_explicit_metric_fallback_and_legacy_read():
    sources = await built_sources()
    section = section_for(sources)
    finding = section["findings"][0]
    finding.pop("coaching")
    finding["coaching_unavailable"] = "complete_record_unavailable"
    finding["citations"] = finding["citations"][:1]
    provider_validator().validate(section)
    incomplete = [s for s in sources if s["kind"] != "pipeline_record"]
    assert (
        text.validate_section(
            section, incomplete, "PIPELINE", require_current_contract=True
        )
        == section
    )
    with pytest.raises(text.SectionValidationError) as exc:
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
    assert exc.value.rule == text.ValidationRule.COACHING_MISSING
    finding.pop("coaching_unavailable")
    finding.pop("topic")
    assert text.validate_section(section, sources, "PIPELINE") == section


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
@pytest.mark.parametrize("subject", ["pipeline", "application", "candidate"])
async def test_both_sdk_paths_send_same_scoped_schema_and_reject_wrong_subject(
    protocol, subject, diagnostics
):
    sources = await built_sources()
    section = section_for(sources)
    section["findings"][0]["subject"] = subject
    async with responses_fixture(body=envelope(section, protocol)) as (endpoint, calls):
        if subject == "pipeline":
            assert (
                await text.analyze_section(
                    text_settings(endpoint, protocol), sources, [], "PIPELINE"
                )
                == section
            )
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
    schema = emitted_schema(prompt)
    assert schema == schemas.PipelineOutputSection.model_json_schema()
    validator = provider_validator(prompt)
    if subject == "pipeline":
        validator.validate(section)
        assert diagnostics == []
    else:
        assert list(validator.iter_errors(section))
        assert diagnostics[-1]["subject"] == subject
        assert diagnostics[-1]["finding_index"] == 0
    user_input = (
        request["input"]
        if protocol == "responses"
        else request["messages"][1]["content"]
    )
    assert json.loads(user_input) == {"sources": sources, "limitations": []}
    if protocol == "responses":
        assert request["text"]["format"] == {"type": "json_object"}
        assert request["store"] is False and request["tools"] == []
    else:
        assert request["response_format"] == {"type": "json_object"}
