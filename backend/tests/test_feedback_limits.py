"""Display limits must not discard safety checks or break citation pointers."""

from copy import deepcopy

import pytest
from tests.test_feedback_coaching import coached_section, sample_sources
from tests.test_feedback_contract import envelope
from tests.test_report_responses_protocol import responses_fixture, text_settings

from app.services import interview_text as text


def overflowing(scope):
    sources = sample_sources()
    section = coached_section(sources, scope)
    finding = section["findings"][0]
    originals = finding["citations"]
    filler = originals[0]
    finding["citations"] = [deepcopy(filler) for _ in range(19)] + originals
    coaching = finding["coaching"]
    if scope == "INTERVIEW":
        coaching["answer_citation"] = 19
    elif scope == "APPLICATION":
        coaching["context_citations"] = [19]
    else:
        coaching["records"][0].update(record_citation=20, round_citations=[21])
    return sources, section


@pytest.mark.parametrize(
    "scope,limit", [("INTERVIEW", 6), ("APPLICATION", 6), ("PIPELINE", 16)]
)
def test_extra_citations_keep_referenced_evidence_and_remap(scope, limit):
    sources, section = overflowing(scope)
    before = deepcopy(section)
    result = text.validate_section(
        section, sources, scope, require_current_contract=True
    )
    finding = result["findings"][0]
    coaching = finding["coaching"]
    assert len(finding["citations"]) == limit
    assert section == before
    if scope == "INTERVIEW":
        assert coaching["answer_citation"] == 4
        assert (
            finding["citations"][coaching["answer_citation"]]
            == before["findings"][0]["citations"][19]
        )
        assert any(
            c["source_id"].endswith("job_description:0") for c in finding["citations"]
        )
    elif scope == "APPLICATION":
        assert coaching["context_citations"] == [5]
        assert (
            finding["citations"][coaching["context_citations"][0]]
            == before["findings"][0]["citations"][19]
        )
    else:
        step = coaching["records"][0]
        assert (
            finding["citations"][step["record_citation"]]
            == before["findings"][0]["citations"][20]
        )
        assert (
            finding["citations"][step["round_citations"][0]]
            == before["findings"][0]["citations"][21]
        )
        assert any(c["source_id"] == "pipeline:metrics:0" for c in finding["citations"])
    assert (
        text.validate_section(result, sources, scope, require_current_contract=True)
        == result
    )


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
@pytest.mark.parametrize("foreign", [False, True])
def test_discarded_extra_citations_still_have_to_be_safe(scope, foreign):
    sources, section = overflowing(scope)
    citation = section["findings"][0]["citations"][18]
    citation["source_id" if foreign else "quote"] = "foreign-or-fabricated"
    with pytest.raises(text.SectionValidationError) as error:
        text.validate_section(section, sources, scope, require_current_contract=True)
    assert error.value.rule == (
        text.ValidationRule.UNKNOWN_SOURCE
        if foreign
        else text.ValidationRule.QUOTE_MISMATCH
    )


@pytest.mark.parametrize(
    "scope,maximum", [("INTERVIEW", 2), ("APPLICATION", 3), ("PIPELINE", 3)]
)
def test_excess_findings_and_section_limitations_are_checked_then_limited(
    scope, maximum
):
    sources = sample_sources()
    section = coached_section(sources, scope)
    section["findings"] = [deepcopy(section["findings"][0]) for _ in range(5)]
    section["limitations"] = [f"Unknown detail {i}" for i in range(10)]
    result = text.validate_section(
        section, sources, scope, require_current_contract=True
    )
    assert len(result["findings"]) == maximum
    assert result["limitations"] == section["limitations"][:8]
    unsafe = deepcopy(section)
    unsafe["findings"][-1]["citations"][0]["quote"] = "Fabricated discarded finding"
    with pytest.raises(text.SectionValidationError):
        text.validate_section(unsafe, sources, scope, require_current_contract=True)


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
def test_long_display_title_is_bounded_in_every_scope(scope):
    sources = sample_sources()
    section = coached_section(sources, scope)
    section["findings"][0]["coaching"]["title"] = "x" * 121
    result = text.validate_section(
        section, sources, scope, require_current_contract=True
    )
    assert result["findings"][0]["coaching"]["title"] == "x" * 120


def test_optional_title_draft_and_branch_preferences_do_not_reject_a_report():
    sources = sample_sources()
    section = coached_section(sources, "APPLICATION")
    coaching = section["findings"][0]["coaching"]
    coaching["title"] = "A descriptive label " * 20
    coaching["branches"] *= 6
    coaching["draft"]["text"] = "A long optional draft. " * 100
    result = text.validate_section(
        section, sources, "APPLICATION", require_current_contract=True
    )
    saved = result["findings"][0]["coaching"]
    assert saved["title"] == coaching["title"][:120]
    assert saved["branches"] == coaching["branches"][:4]
    assert "draft" not in saved


def test_excess_records_are_validated_before_selecting_six():
    sources, section = overflowing("PIPELINE")
    coaching = section["findings"][0]["coaching"]
    original = coaching["records"][0]
    coaching["records"] = [
        {**original, "action": f"Check recorded detail {i}."} for i in range(8)
    ]
    result = text.validate_section(
        section, sources, "PIPELINE", require_current_contract=True
    )
    assert len(result["findings"][0]["coaching"]["records"]) == 6
    coaching["records"][-1]["record_citation"] = 0  # A metric is not a record.
    with pytest.raises(text.SectionValidationError) as error:
        text.validate_section(
            section, sources, "PIPELINE", require_current_contract=True
        )
    assert error.value.rule == text.ValidationRule.RECORD_SOURCE


@pytest.mark.parametrize("field", ["action", "limitations"])
def test_safety_relevant_advice_and_caveats_are_never_cut_mid_sentence(field):
    sources = sample_sources()
    section = coached_section(sources, "APPLICATION")
    section["findings"][0][field] = "A long condition or caveat. " * 100
    with pytest.raises(ValueError):
        text.validate_section(
            section, sources, "APPLICATION", require_current_contract=True
        )


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_application_overflow_from_both_provider_paths(protocol):
    sources, section = overflowing("APPLICATION")
    section["findings"] *= 4
    async with responses_fixture(body=envelope(section, protocol)) as (endpoint, calls):
        result = await text.analyze_section(
            text_settings(endpoint, protocol), sources, [], "APPLICATION"
        )
    assert len(calls) == 1
    assert len(result["findings"]) == 3
    assert all(len(finding["citations"]) == 6 for finding in result["findings"])
