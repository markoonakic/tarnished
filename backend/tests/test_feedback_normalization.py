"""Display mistakes must not hide either useful feedback or unsafe evidence."""

from copy import deepcopy

import pytest
from tests.test_feedback_coaching import (
    APP_ID,
    OTHER_ID,
    coached_section,
    sample_sources,
)

from app.services.interview_text import (
    SAFE_FAILURE_MESSAGES,
    SectionValidationError,
    ValidationRule,
    _system_prompt,
    validate_section,
)


@pytest.mark.parametrize(
    "pointers,expected",
    [
        ([5], []),
        ([0, 0, 5], [0]),
        ([-1, 16, 999, True, False, "0", None, {}, 0], [0]),
        ([], []),
        (None, []),
        ("0", []),
        ([0] * 30, [0]),
    ],
)
def test_application_context_normalizes_before_schema_bounds(pointers, expected):
    sources = sample_sources()
    value = coached_section(sources, "APPLICATION")
    value["findings"][0]["coaching"]["context_citations"] = pointers
    original = deepcopy(value)
    saved = validate_section(
        value, sources, "APPLICATION", require_current_contract=True
    )
    expected_value = deepcopy(value)
    expected_value["findings"][0]["coaching"]["context_citations"] = expected
    assert saved == expected_value
    assert value == original
    assert (
        validate_section(saved, sources, "APPLICATION", require_current_contract=True)
        == saved
    )


@pytest.mark.parametrize(
    "passage", ['  {"company": "Example Labs"}', "[1, 2]", "x" * 501]
)
def test_application_drops_display_passage_but_keeps_verified_citation(passage):
    sources = sample_sources()
    sources[3]["text"] = passage
    value = coached_section(sources, "APPLICATION")
    saved = validate_section(
        value, sources, "APPLICATION", require_current_contract=True
    )
    assert saved["findings"][0]["coaching"]["context_citations"] == []
    assert saved["findings"][0]["citations"] == value["findings"][0]["citations"]


def test_application_context_can_be_missing_or_select_more_than_four():
    sources = sample_sources()
    value = coached_section(sources, "APPLICATION")
    finding = value["findings"][0]
    finding["coaching"].pop("context_citations")
    saved = validate_section(
        value, sources, "APPLICATION", require_current_contract=True
    )
    assert saved["findings"][0]["coaching"]["context_citations"] == []
    finding["citations"] *= 6
    finding["coaching"]["context_citations"] = [5, 0, 1, 2, 3, 4]
    saved = validate_section(
        value, sources, "APPLICATION", require_current_contract=True
    )
    assert saved["findings"][0]["coaching"]["context_citations"] == [5, 0, 1, 2]


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
@pytest.mark.parametrize(
    "change,rule",
    [
        ("fake_quote", ValidationRule.QUOTE_MISMATCH),
        ("foreign", ValidationRule.UNKNOWN_SOURCE),
    ],
)
def test_display_normalization_never_removes_unsafe_citations(scope, change, rule):
    sources = sample_sources()
    value = coached_section(sources, scope)
    finding = value["findings"][0]
    if scope == "APPLICATION":
        finding["coaching"]["context_citations"] = [999]
    elif scope == "PIPELINE":
        finding["coaching"]["records"][0]["round_citations"] = [999]
    citation = finding["citations"][-1]
    citation["quote" if change == "fake_quote" else "source_id"] = (
        "not in the supplied sources"
    )
    with pytest.raises(SectionValidationError) as error:
        validate_section(value, sources, scope, require_current_contract=True)
    assert error.value.rule == rule


def test_pipeline_normalizes_optional_round_pointers_and_identical_steps():
    sources = sample_sources()
    value = coached_section(sources, "PIPELINE")
    coaching = value["findings"][0]["coaching"]
    coaching["records"][0]["round_citations"] = [15, 2, 2, -1, True, "2", 999]
    coaching["records"] *= 2
    saved = validate_section(value, sources, "PIPELINE", require_current_contract=True)
    steps = saved["findings"][0]["coaching"]["records"]
    assert len(steps) == 1
    assert steps[0]["round_citations"] == [2]
    assert (
        validate_section(saved, sources, "PIPELINE", require_current_contract=True)
        == saved
    )


def test_pipeline_keeps_distinct_actions_for_the_same_verified_record():
    sources = sample_sources()
    value = coached_section(sources, "PIPELINE")
    steps = value["findings"][0]["coaching"]["records"]
    steps.append(
        {
            **steps[0],
            "condition": "If your own notes show it was practice",
            "action": "Keep it as practice. Do not contact an employer.",
        }
    )
    assert (
        validate_section(value, sources, "PIPELINE", require_current_contract=True)
        == value
    )


@pytest.mark.parametrize(
    "change,rule",
    [
        ("foreign_round", ValidationRule.ROUND_IDENTITY),
        ("wrong_source", ValidationRule.RECORD_SOURCE),
    ],
)
def test_pipeline_checks_all_round_links_before_display_limit(change, rule):
    sources = sample_sources()
    value = coached_section(sources, "PIPELINE")
    finding = value["findings"][0]
    # The fifth round pointer must still be checked, even though only four display.
    finding["citations"].extend(deepcopy(finding["citations"][2]) for _ in range(4))
    finding["coaching"]["records"][0]["round_citations"] = [2, 3, 4, 5, 6]
    if change == "foreign_round":
        sources[6]["text"] += sources[6]["text"].replace(APP_ID, OTHER_ID)
        finding["citations"][6]["quote"] = finding["citations"][6]["quote"].replace(
            APP_ID, OTHER_ID
        )
    else:
        finding["citations"][6] = deepcopy(finding["citations"][1])
    with pytest.raises(SectionValidationError) as error:
        validate_section(value, sources, "PIPELINE", require_current_contract=True)
    assert error.value.rule == rule


def test_plain_failure_message_and_display_prompt_examples():
    assert SAFE_FAILURE_MESSAGES["report_grounding"] == (
        "The AI response could not be verified against your data, so it was not saved. Try again."
    )
    for message in SAFE_FAILURE_MESSAGES.values():
        assert not any(
            term in message.lower()
            for term in ("explicit retry", "schema", "json", "4xx", "5xx", "dns", "tls")
        )
    assert "[0, 1], never [1, 2]" in _system_prompt("APPLICATION")
    assert "round_citations is [2], not [3]" in _system_prompt("PIPELINE")
