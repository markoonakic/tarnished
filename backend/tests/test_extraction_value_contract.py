"""Field-bound extraction output; fail closed without hiding scalar errors."""

import json
from copy import deepcopy
from typing import get_args

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from tests.test_feedback_contract import envelope
from tests.test_report_responses_protocol import responses_fixture, text_settings
from tests.test_report_validation_diagnostics import JOB_ID, SECRET
from tests.test_report_validation_diagnostics import diagnostics as diagnostics

from app.schemas.job_analysis import (
    MAX_PAY,
    PROPOSAL_STRING_LIMITS,
    REQUIREMENTS,
    SCALAR_OPTIONS,
    FieldName,
)
from app.services import interview_text as text
from app.services.report_output import (
    citation_choices,
    output_schema,
    resolve_citations,
)

POSTING = (
    "Matrix R2 3: Junior Python Developer at Cedar Workshop 3. Location: Belgrade, Serbia. "
    "Hybrid. Full-time. Requirements: Python, SQL, REST APIs, Git and unit testing. "
    "Nice to have: FastAPI and Docker. Responsibilities: Build API endpoints, "
    "validate incoming data and write tests. Salary: 1200 to 1600 EUR per month. "
    "Apply by 2026-12-15."
)
SOURCES = [{"data": {"posting": POSTING}}]
CHOICES = citation_choices(SOURCES, "EXTRACTION")
SCHEMA = output_schema("EXTRACTION", CHOICES)
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())
LIST_FIELDS = (*REQUIREMENTS, "responsibilities")


def item(field, value, quote=0):
    return {"id": field, "field": field, "value": value, "quote": quote}


def wire_items(*proposals):
    fields = {
        field: [] if field in LIST_FIELDS else None for field in get_args(FieldName)
    }
    for proposal in proposals:
        field = proposal["field"]
        entry = {key: proposal[key] for key in ("value", "quote")}
        if field in LIST_FIELDS:
            fields[field].append(entry)
        else:
            fields[field] = entry
    return {"items": fields}


@pytest.mark.parametrize("field", get_args(FieldName))
def test_every_field_has_a_matching_value_contract(field):
    value = (
        1200
        if field in ("salary_min", "salary_max")
        else SCALAR_OPTIONS[field][0]
        if field in SCALAR_OPTIONS
        else "2026-10-12"
        if field in ("posted_date", "deadline")
        else "Text"
    )
    quote = (
        next(key for key, item in CHOICES.items() if "Apply by" in item["quote"])
        if field == "deadline"
        else 0
    )
    if field == "deadline":
        value = "2026-12-15"
    wire = wire_items(item(field, value, quote))
    VALIDATOR.validate(wire)
    resolved = resolve_citations(wire, CHOICES, "EXTRACTION")
    saved = text.validate_section(resolved, SOURCES, "EXTRACTION")
    assert all(proposal["quote"] in POSTING for proposal in saved["items"])
    if field in LIST_FIELDS:
        assert saved["items"][0]["value"] in saved["items"][0]["quote"]
    assert resolved["items"][0]["field"] == field
    # Integers belong only to pay fields; text belongs to every other field.
    wrong_type = "1200" if isinstance(value, int) else 1200
    assert list(VALIDATOR.iter_errors(wire_items(item(field, wrong_type))))


@pytest.mark.parametrize(
    "field,value,rule,code",
    [
        ("salary_min", "1,200", "proposal.pay", "proposal_pay"),
        ("salary_min", "1200 EUR", "proposal.pay", "proposal_pay"),
        ("salary_min", "1200.0", "proposal.pay", "proposal_pay"),
        ("salary_min", "²", "proposal.pay", "proposal_pay"),
        ("salary_max", -1, "proposal.pay", "proposal_pay"),
        ("salary_max", MAX_PAY + 1, "proposal.pay", "proposal_pay"),
        ("work_mode", "Hybrid", "proposal.option", "proposal_option"),
        ("employment_type", "Full-time", "proposal.option", "proposal_option"),
        ("pay_period", "monthly", "proposal.option", "proposal_option"),
        ("posted_date", "2026-02-30", "proposal.date", "proposal_date"),
        ("posted_date", "20261215", "proposal.date", "proposal_date"),
        ("posted_date", "15 December 2026", "proposal.date", "proposal_date"),
        ("title", " " * 5, "schema.text", "text_meaningful"),
        ("title", "text\x00text", "schema.text", "text_meaningful"),
        ("title", 1200, "schema.type", "proposal_type"),
        *[
            (field, "x" * (limit + 1), "schema.length", "proposal_length")
            for field, limit in PROPOSAL_STRING_LIMITS.items()
        ],
    ],
)
def test_provider_contract_rejects_locally_invalid_values(
    field, value, rule, code, diagnostics
):
    wire = wire_items(item(field, value))
    assert list(VALIDATOR.iter_errors(wire))
    with text.validation_context(JOB_ID, "EXTRACTION", 0):
        with pytest.raises(ValueError):
            text.validate_section(
                resolve_citations(wire, CHOICES, "EXTRACTION"), SOURCES, "EXTRACTION"
            )
    assert diagnostics == [
        {
            "rule": rule,
            "path": ["items", 0, "value"],
            "code": code,
            "job_id": JOB_ID,
            "scope": "EXTRACTION",
            "section_index": 0,
        }
    ]
    if isinstance(value, str):
        assert value not in json.dumps(diagnostics)


@pytest.mark.parametrize("field,limit", PROPOSAL_STRING_LIMITS.items())
def test_string_limits_include_the_boundary(field, limit):
    wire = wire_items(item(field, "x" * limit))
    VALIDATOR.validate(wire)
    text.validate_section(
        resolve_citations(wire, CHOICES, "EXTRACTION"), SOURCES, "EXTRACTION"
    )


@pytest.mark.parametrize("field", ["salary_min", "salary_max"])
@pytest.mark.parametrize("value", [0, MAX_PAY])
def test_pay_limits_include_the_boundary(field, value):
    wire = wire_items(item(field, value))
    VALIDATOR.validate(wire)
    text.validate_section(
        resolve_citations(wire, CHOICES, "EXTRACTION"), SOURCES, "EXTRACTION"
    )
    # Existing saved digit strings remain readable, but the new wire uses integers.
    legacy = {"items": [item(field, str(value))]}
    assert (
        text.validate_section(
            resolve_citations(legacy, CHOICES, "EXTRACTION"), SOURCES, "EXTRACTION"
        )["items"][0]["value"]
        == value
    )


@pytest.mark.parametrize("field,options", SCALAR_OPTIONS.items())
def test_all_canonical_options_are_supported(field, options):
    for value in options:
        wire = wire_items(item(field, value))
        VALIDATOR.validate(wire)
        text.validate_section(
            resolve_citations(wire, CHOICES, "EXTRACTION"), SOURCES, "EXTRACTION"
        )


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_matrix_pay_and_compare_flow_on_both_transports(protocol):
    salary_choice = next(
        key for key, value in CHOICES.items() if "Salary:" in value["quote"]
    )
    requirement_choice = next(
        key for key, value in CHOICES.items() if "Requirements:" in value["quote"]
    )
    wire = wire_items(
        item("must_have", "Python", requirement_choice),
        item("salary_min", 1200, salary_choice),
        item("salary_max", 1600, salary_choice),
        item("salary_currency", "EUR", salary_choice),
        item("pay_period", "month", salary_choice),
    )
    VALIDATOR.validate(wire)
    async with responses_fixture(body=envelope(wire, protocol)) as (endpoint, calls):
        extracted = await text.analyze_section(
            text_settings(endpoint, protocol), SOURCES, [], "EXTRACTION"
        )
    assert len(calls) == 1
    assert extracted == text.validate_section(
        resolve_citations(wire, CHOICES, "EXTRACTION"), SOURCES, "EXTRACTION"
    )
    assert all(proposal["quote"] in POSTING for proposal in extracted["items"])
    requirement = next(
        proposal for proposal in extracted["items"] if proposal["field"] == "must_have"
    )
    matched_sources = [
        {
            "data": {
                "requirements": [{"id": "r1", "text": requirement["value"]}],
                "profile": [{"id": "p1", "text": "Built Python services."}],
            }
        }
    ]
    match = {
        "rows": {
            "r1": {"state": "confirmed", "why": "Saved Python work.", "evidence": [0]}
        }
    }
    async with responses_fixture(body=envelope(match, protocol)) as (endpoint, calls):
        result = await text.analyze_section(
            text_settings(endpoint, protocol), matched_sources, [], "PROFILE_MATCH"
        )
    assert len(calls) == 1
    assert result["rows"][0]["evidence"] == [
        {"profile_id": "p1", "quote": "Built Python services."}
    ]


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_bad_sixteenth_value_has_a_safe_rule_without_retry(protocol, diagnostics):
    # Older compatible services may return the stored list form. It must still
    # fail closed, with the actual scalar rule rather than unknown_validation.
    wire = {
        "items": [
            {**item("must_have", "Python"), "id": f"r{index}"} for index in range(16)
        ]
        + [item("salary_min", SECRET)]
    }
    async with responses_fixture(body=envelope(wire, protocol)) as (endpoint, calls):
        with text.validation_context(JOB_ID, "EXTRACTION", 0):
            with pytest.raises(text.ReportFailure) as error:
                await text.analyze_section(
                    text_settings(endpoint, protocol), SOURCES, [], "EXTRACTION"
                )
    assert error.value.category == "report_grounding"
    assert len(calls) == 1
    assert diagnostics[0]["rule"] == "proposal.pay"
    assert diagnostics[0]["path"] == ["items", 16, "value"]
    assert diagnostics[0]["code"] == "proposal_pay"
    assert SECRET not in json.dumps(diagnostics)
    changed = deepcopy(wire)
    changed["items"] = [item("salary_min", 1200, "Invented evidence")]
    with pytest.raises(ValueError):
        text.validate_section(changed, SOURCES, "EXTRACTION")
    changed["items"][0]["quote"] = 9999
    with pytest.raises(text.SectionValidationError):
        resolve_citations(changed, CHOICES, "EXTRACTION")


@pytest.mark.parametrize(
    "change", ["unknown", "missing", "scalar_list", "list_null", "extra_id"]
)
def test_structural_contract_is_not_repaired(change):
    wire = wire_items(item("title", "Developer"))
    if change == "unknown":
        wire["items"][SECRET] = None
    elif change == "missing":
        del wire["items"]["company"]
    elif change == "scalar_list":
        wire["items"]["title"] = [wire["items"]["title"]]
    elif change == "list_null":
        wire["items"]["must_have"] = None
    else:
        wire["items"]["title"]["id"] = "invented"
    assert list(VALIDATOR.iter_errors(wire))
    with pytest.raises(text.SectionValidationError):
        resolve_citations(wire, CHOICES, "EXTRACTION")


def test_total_proposal_bound_and_structural_ids_remain_strict():
    wire = wire_items(
        *(item("must_have", "Python") for _ in range(51)),
        *(item("nice_to_have", "SQL") for _ in range(50)),
    )
    # The provider has per-field bounds; local validation enforces the original
    # total of 100 after expansion, never clipping excess proposals.
    resolved = resolve_citations(wire, CHOICES, "EXTRACTION")
    assert len({proposal["id"] for proposal in resolved["items"]}) == 101
    with pytest.raises(ValueError):
        text.validate_section(resolved, SOURCES, "EXTRACTION")
    wire["items"]["nice_to_have"].pop()
    # A discovered deadline counts toward the same total; no proposal is dropped.
    with pytest.raises(ValueError):
        text.validate_section(
            resolve_citations(wire, CHOICES, "EXTRACTION"), SOURCES, "EXTRACTION"
        )
    bounded_sources = [
        {"data": {"posting": POSTING.replace("Apply by 2026-12-15.", "")}}
    ]
    assert (
        len(
            text.validate_section(
                resolve_citations(wire, CHOICES, "EXTRACTION"),
                bounded_sources,
                "EXTRACTION",
            )["items"]
        )
        == 100
    )
