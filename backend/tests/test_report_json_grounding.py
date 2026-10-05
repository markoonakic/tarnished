"""Formatting is not fabricated evidence; source identity and values still matter."""

import json
from copy import deepcopy

import pytest
from tests.test_feedback_contract import envelope
from tests.test_pipeline_record_contract import built_sources, section_for
from tests.test_report_responses_protocol import responses_fixture, text_settings

from app.services import interview_text as text


async def test_reordered_complete_record_and_metric_subset_are_grounded():
    sources = await built_sources()
    section = section_for(sources)
    citations = section["findings"][0]["citations"]
    citations[0]["quote"] = '{ "total_applications": 2e1 }'
    for citation in citations[1:]:
        record = json.loads(citation["quote"])
        citation["quote"] = json.dumps(dict(reversed(list(record.items()))), indent=2)
    assert (
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
        == section
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("company", "Fabricated Ltd"),
        ("application_id", "22222222-2222-4222-8222-222222222222"),
    ],
)
async def test_fabricated_value_or_other_owners_record_is_rejected(field, value):
    sources = await built_sources()
    section = section_for(sources)
    citation = section["findings"][0]["citations"][1]
    record = json.loads(citation["quote"])
    record[field] = value
    citation["quote"] = json.dumps(record, separators=(",", ":"))
    with pytest.raises(text.SectionValidationError) as error:
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
    assert error.value.rule == text.ValidationRule.QUOTE_MISMATCH


@pytest.mark.parametrize(
    "passage,quote,accepted",
    [
        ('{"rows":[{"name":"A", "count":2}]}', '{"count":2.0,"name":"A"}', True),
        ('{"rows":[{"name":"A", "count":2}]}', '{ "count": 2e0 }', True),
        ('{"rows":[{"name":"A", "count":2}]}', '{"count":3}', False),
        (
            '{"rows":[{"name":"A","count":2},{"name":"B","count":3}]}',
            '{"name":"A", "count":3}',
            False,
        ),
        ('{"count":true}', '{"count":1}', False),
        ('{"count":9007199254740993}', '{"count":9007199254740992.0}', False),
        ('{"count":9007199254740993}', '{"count":9007199254740993.0}', True),
        ('{"name":"A  B"}', '{"name": "A B"}', False),
        ('{"name":"A  B"}', '"name": "A B"', False),
        ('{"rows":[1,2]}', '{"rows": [2, 1]}', False),
        ('{"rows":[1,2]}', "{ }", False),
        ('{"rows":{}}', "{ }", True),
        ('{"rows":[1,2]}', "[1.0, 2e0]", True),
        ('{"count":2}', '{"count":NaN}', False),
        ('{"count":2}', '{"count":1,"count":2}', False),
        ('{"note":"[1,2]"}', "[1, 2]", False),
        ('{"note":"{\\"count\\":2}"}', '{ "count": 2 }', False),
    ],
)
@pytest.mark.parametrize(
    "kind", ["pipeline_metrics", "pipeline_record", "profile", "history"]
)
def test_json_values_not_text_rewrites(passage, quote, accepted, kind):
    assert text.quote_matches(quote, {"text": passage, "kind": kind}) is accepted


def test_complete_objects_in_single_chunks_only():
    source = {
        "kind": "pipeline_record",
        "text": '{"applications": [{"company": "A", "count": 2}, {"company":',
    }
    assert text.quote_matches('{"count":2.0,"company":"A"}', source)
    assert not text.quote_matches('{"company":"B", "count":3}', source)
    # A later chunk can contain a complete record, but never a rebuilt split record.
    source["text"] = '"B", "count": 3}, {"company":"C", "count":4}]}'
    assert text.quote_matches('{"count":4e0,"company":"C"}', source)
    assert not text.quote_matches('{"company":"B", "count":3}', source)


@pytest.mark.parametrize("kind", ["transcript", "requirement", "cv"])
def test_plain_text_spacing_only(kind):
    source = {"kind": kind, "text": "I checked\n the result.\tThen   tested it."}
    assert text.quote_matches("I checked the result. Then tested it.", source)
    assert not text.quote_matches("I checked the result. Then approved it.", source)
    assert not text.quote_matches(" ", {"kind": kind, "text": "Word"})


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
@pytest.mark.parametrize(
    "wrapper",
    [
        "```json\n{}\n```",
        "Here is the report:\n{}",
        "Here is the report:\n```json\n{}\n```\nEnd of report.",
        "{}\nEnd of report.",
    ],
)
async def test_fenced_or_prose_wrapped_report_on_both_provider_paths(protocol, wrapper):
    sources = await built_sources()
    section = section_for(sources)
    body = json.loads(envelope(section, protocol))
    content = wrapper.format(json.dumps(section))
    if protocol == "responses":
        body["output"][0]["content"][0]["text"] = content
    else:
        body["choices"][0]["message"]["content"] = content
    async with responses_fixture(body=json.dumps(body).encode()) as (endpoint, calls):
        result = await text.analyze_section(
            text_settings(endpoint, protocol), sources, [], "PIPELINE"
        )
    assert result == section
    assert len(calls) == 1


@pytest.mark.parametrize(
    "output",
    [
        "```json\n{}\n```\n```json\n{}\n```",
        "Report: {} {}",
        '{"findings": broken}\n{"findings": [], "limitations": []}',
        '{"findings": [], "findings": [], "limitations": []}',
        '```json\n{"findings":\n```',
        '{"findings": NaN}',
    ],
)
def test_ambiguous_or_invalid_json_is_not_repaired(output):
    with pytest.raises(ValueError):
        text.parse_section(output)


@pytest.mark.parametrize(
    "output,code",
    [
        ('{"private-value":', "invalid_json"),
        ('{"private-value":1,"private-value":2}', "duplicate_key"),
        ("Report: {} {}", "invalid_wrapper"),
    ],
)
def test_parse_error_categories_do_not_log_provider_text(monkeypatch, output, code):
    events = []
    monkeypatch.setattr(
        text._validation_logger,
        "warning",
        lambda _, value: events.append(json.loads(value)),
    )
    with pytest.raises(ValueError) as error:
        text.parse_section(output)
    text.log_validation_failure(error.value, "PIPELINE")
    assert events == [
        {"rule": "schema.parse", "path": [], "code": code, "scope": "PIPELINE"}
    ]
    assert "private-value" not in json.dumps(events)


def test_plain_json_with_fence_text_inside_a_string_still_parses():
    value = {"findings": [], "limitations": ["The answer included ```python."]}
    assert text.parse_section(json.dumps(value)) == value


async def test_record_subset_does_not_weaken_complete_coaching_contract():
    sources = await built_sources()
    section = deepcopy(section_for(sources))
    citation = section["findings"][0]["citations"][1]
    citation["quote"] = (
        '{ "company": ' + json.dumps(json.loads(citation["quote"])["company"]) + " }"
    )
    with pytest.raises(text.SectionValidationError) as error:
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
    assert error.value.rule == text.ValidationRule.RECORD_CONTEXT
