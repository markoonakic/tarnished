"""Original Serbian spans, explicit deadlines and Unicode-safe feedback."""

import json
import unicodedata
from copy import deepcopy
from types import SimpleNamespace

import pytest
from tests.test_feedback_coaching import coached_section, sample_sources
from tests.test_feedback_contract import envelope
from tests.test_job_analyses import saved_analysis
from tests.test_report_responses_protocol import responses_fixture, text_settings
from tests.test_workspace_v030 import post
from tests.test_workspace_v030 import workspace as workspace

from app.models import Application, JobLead
from app.schemas.job_analysis import ReviewItem
from app.services import interview_text as text
from app.services import job_analyses as analyses
from app.services.interview_evidence import _append_source, fingerprint
from app.services.lead_capture import capture_complete_source
from app.services.report_output import citation_choices, output_schema
from app.services.requirement_insights import current_requirements
from app.services.source_text import explicit_deadlines, normalize_text


@pytest.mark.parametrize(
    "field",
    ["must_have", "nice_to_have", "responsibilities", "other_conditions", "education"],
)
@pytest.mark.parametrize(
    "original,corrupt",
    [
        (
            "Eksperimentisanje sa različitim modelima",
            "Eksperimentisanje sa razliāitim modelima",
        ),
        ("Rad u Git okruženju", "Rad u Git okruűenju"),
        (
            "Čuvanje, ćirilica, žičani, šema, đak",
            "Āuvanje, ćirilica, űičani, šema, đak",
        ),
        ("Различити модели, ч ћ ж ш ђ", "Разлиāити модели, ч ћ ж ш ђ"),
        ("Iskustvo sa rešenjima", "Iskustvo sa re�enjima"),
    ],
)
def test_extraction_keeps_original_letters(field, original, corrupt):
    quote = "  + " + original + "\n"
    output = {
        "items": [{"id": "one", "field": field, "value": corrupt, "quote": quote}]
    }
    before = deepcopy(output)
    saved = text.validate_section(output, [{"data": {"posting": quote}}], "EXTRACTION")
    assert saved["items"][0]["value"] == original
    assert saved["items"][0]["quote"] == quote
    assert output == before


def test_exact_value_can_select_part_of_a_longer_quote():
    output = {
        "items": [
            {
                "id": "one",
                "field": "must_have",
                "value": "Python",
                "quote": "Python and SQL required",
            }
        ]
    }
    assert (
        text.validate_section(
            output, [{"data": {"posting": "Python and SQL required"}}], "EXTRACTION"
        )
        == output
    )


@pytest.mark.parametrize(
    "posting",
    [
        "Apply by 2026-12-15.",
        "Application deadline: 2026-12-15.",
        "Rok za prijavu: 15.12.2026.",
        "Рок за пријаву: 15. 12. 2026.",
        '{"validThrough": "2026-12-15T23:59:59"}',
    ],
)
@pytest.mark.parametrize(
    "classification", [None, "other_conditions", "must_have", "deadline"]
)
def test_explicit_deadline_is_not_a_candidate_requirement(posting, classification):
    proposals = (
        []
        if classification is None
        else [
            {
                "id": "one",
                "field": classification,
                "value": "2026-12-15" if classification == "deadline" else posting,
                "quote": posting,
            }
        ]
    )
    saved = text.validate_section(
        {"items": proposals}, [{"data": {"posting": posting}}], "EXTRACTION"
    )
    assert len(saved["items"]) == 1
    assert saved["items"][0]["field"] == "deadline"
    assert saved["items"][0]["value"] == "2026-12-15"
    assert saved["items"][0]["quote"] in posting


@pytest.mark.parametrize(
    "posting",
    [
        "Posted 2026-12-15.",
        "Interview on 2026-12-15.",
        "Apply by 2026-02-30.",
        "Apply by 2026-12-15. Apply by 2026-12-16.",
    ],
)
def test_deadline_is_never_guessed(posting):
    assert text.validate_section(
        {"items": []}, [{"data": {"posting": posting}}], "EXTRACTION"
    ) == {"items": []}


@pytest.mark.parametrize("quote", ["2026-12-15", "15.12.2026."])
def test_model_deadline_can_select_an_original_numeric_date(quote):
    item = {
        "id": "deadline",
        "field": "deadline",
        "value": "2026-12-15",
        "quote": quote,
    }
    assert text.validate_section(
        {"items": [item]}, [{"data": {"posting": quote}}], "EXTRACTION"
    )["items"] == [item]


def test_deadline_requires_the_labelled_source_date():
    item = {
        "id": "deadline",
        "field": "deadline",
        "value": "2026-12-16",
        "quote": "Apply by 2026-12-15",
    }
    with pytest.raises(text.SectionValidationError):
        text.validate_section(
            {"items": [item]}, [{"data": {"posting": item["quote"]}}], "EXTRACTION"
        )


@pytest.mark.parametrize("source_form,quote_form", [("NFD", "NFC"), ("NFC", "NFD")])
def test_sources_and_quotes_use_nfc_without_changing_letters(source_form, quote_form):
    passage = "Različiti č ć ž š đ; Различити ч ћ ж ш ђ."
    source = {
        "kind": "requirement",
        "text": unicodedata.normalize(source_form, passage),
    }
    quote = unicodedata.normalize(quote_form, passage)
    assert text.quote_matches(quote, source)
    assert not text.quote_matches(passage.replace("č", "ā"), source)
    assert not text.quote_matches(passage.replace(";", ","), source)
    sources = []
    _append_source(sources, "posting", "requirement", source["text"])
    assert sources[0]["text"] == passage
    assert capture_complete_source(source["text"])["source_text"] == passage
    # Existing JSON with escaped combining characters receives the same check.
    json_source = {"kind": "requirement", "text": json.dumps([source["text"]])}
    assert text.quote_matches(json.dumps([quote]), json_source)


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_application_feedback_uses_selected_original_serbian_passages(protocol):
    sources = sample_sources()
    sources[3]["text"] = (
        "Rad u Git okruženju. Eksperimentisanje sa različitim modelima."
    )
    choices = citation_choices(sources, "APPLICATION")
    section = coached_section(sources, "APPLICATION")
    original = deepcopy(section)
    finding = section["findings"][0]
    finding["citations"] = [
        next(key for key, choice in choices.items() if choice == citation)
        for citation in finding["citations"]
    ]
    assert (
        output_schema("APPLICATION", choices)["$defs"]["Citation"]["type"] == "integer"
    )
    async with responses_fixture(body=envelope(section, protocol)) as (endpoint, calls):
        saved = await text.analyze_section(
            text_settings(endpoint, protocol), sources, [], "APPLICATION"
        )
    assert saved == original
    assert len(calls) == 1
    assert "citation_choices" in json.dumps(calls[0][1])


@pytest.mark.parametrize("decision", ["accepted", "edited"])
async def test_save_and_conversion_keep_source_values_and_deadline(
    client, db, workspace, decision
):
    user, headers, _, _, _ = workspace
    original = "Rad u Git okruženju, č ć ž š đ."
    posting = unicodedata.normalize("NFD", original) + " Apply by 2026-12-15."
    created = await post(
        client,
        "/job-leads",
        {"title": "Developer", "company": "Example", "text": posting},
        headers,
    )
    lead = await db.get(JobLead, created["id"])
    row = await saved_analysis(db, user, lead)
    output = {
        "items": [
            {
                "id": "r",
                "field": "must_have",
                "value": "Rad u Git okruűenju, č ć ž š đ.",
                "quote": original,
            },
            {
                "id": "d",
                "field": "responsibilities",
                "value": "Rad u Git okruűenju, č ć ž š đ.",
                "quote": original,
            },
            {
                "id": "date",
                "field": "other_conditions",
                "value": "Apply by 2026-12-15",
                "quote": "Apply by 2026-12-15.",
            },
        ]
    }
    row.draft = text.validate_section(
        output, [{"data": {"posting": lead.source_text}}], "EXTRACTION"
    )
    await db.commit()
    choices = [
        ReviewItem(
            id=item["id"],
            decision=decision if item["id"] == "r" else "accepted",
            value="User correction" if decision == "edited" else None,
        )
        for item in row.draft["items"]
    ]
    await analyses.apply_extraction(db, row, row.revision, lead.revision, choices)
    await db.commit()
    expected = "User correction" if decision == "edited" else original
    assert lead.requirements_must_have == [expected]
    assert lead.description == original
    assert lead.deadline.isoformat() == "2026-12-15"
    assert len(analyses.comparison_inputs(lead, None)[0]["requirements"]) == 1
    response = await client.post(f"/api/job-leads/{lead.id}/convert", headers=headers)
    assert response.status_code == 201, response.text
    app = await db.get(Application, response.json()["id"])
    assert app.requirements_must_have == [expected]
    assert app.job_description == original
    assert app.deadline == lead.deadline
    assert app.source_text == normalize_text(posting)
    assert app.confirmed_requirements[0]["source_hash"] == fingerprint(app.source_text)


async def test_conversion_repairs_old_accepted_spelling_but_not_user_edits(
    client, db, workspace
):
    user, headers, _, _, _ = workspace
    original = "Rad u Git okruženju, č ć ž š đ."
    corrupt = "Rad u Git okruűenju, č ć ž š đ."
    created = await post(
        client,
        "/job-leads",
        {"title": "Developer", "company": "Example", "text": original},
        headers,
    )
    lead = await db.get(JobLead, created["id"])
    row = await saved_analysis(db, user, lead)
    lead.description = corrupt
    lead.requirements_must_have = [corrupt, "User correction"]
    lead.confirmed_requirements = [
        {
            "id": "posting",
            "type": "must_have",
            "text": corrupt,
            "quote": original,
            "source_hash": fingerprint(lead.source_text),
            "authorship": "posting",
            "review_state": "accepted",
        },
        {
            "id": "edited",
            "type": "must_have",
            "text": "User correction",
            "quote": original,
            "source_hash": fingerprint(lead.source_text),
            "authorship": "user",
            "review_state": "edited",
        },
    ]
    row.review_state = "saved"
    row.reviewed = [
        {
            "id": "d",
            "field": "responsibilities",
            "value": corrupt,
            "quote": original,
            "decision": "accepted",
        }
    ]
    await db.commit()
    response = await client.post(f"/api/job-leads/{lead.id}/convert", headers=headers)
    assert response.status_code == 201, response.text
    app = await db.get(Application, response.json()["id"])
    assert app.job_description == original
    assert app.requirements_must_have == [original, "User correction"]
    assert app.confirmed_requirements[0]["text"] == original
    assert app.confirmed_requirements[1]["text"] == "User correction"
    assert lead.description == corrupt  # Conversion does not rewrite the lead.


@pytest.mark.parametrize("value", ["Apply by 2026-12-15", "2026-12-15"])
def test_old_deadline_conditions_never_enter_profile_matching(value):
    deadline = {
        "id": "date",
        "type": "other_conditions",
        "text": value,
        "quote": "Apply by 2026-12-15",
    }
    requirement = {
        "id": "python",
        "type": "must_have",
        "text": "Python",
        "quote": "Python is required. Apply by 2026-12-15",
    }
    record = SimpleNamespace(
        source_text="", confirmed_requirements=[deadline, requirement]
    )
    assert current_requirements(record) == [requirement]


def test_deadline_parser_leaves_unlabelled_dates_alone():
    assert explicit_deadlines("Posted 2026-12-15") == []
