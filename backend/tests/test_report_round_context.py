import pytest

from app.schemas.job_lead import JobLeadExtractionInput
from app.services.extraction import EXTRACTION_SYSTEM_PROMPT
from app.services.interview_evidence import (
    application_evidence_sources,
    application_sections,
    evidence_sources,
    sections,
)
from app.services.interview_text import _system_prompt


@pytest.mark.parametrize("scope", ["APPLICATION", "INTERVIEW"])
async def test_completed_round_dates_and_outcome_reach_later_sections(scope):
    row = {
        "id": "round",
        "notes_summary": "notes " * 6000,
        "transcript_summary": None,
        "scheduled_at": "2026-01-03T09:00:00Z",
        "completed_at": "2026-01-03T10:00:00Z",
        "outcome": "Passed",
    }
    data = {
        "application_id": "application",
        "application": {"job_description": "Python required"},
        "history": [],
        "profile": {},
        "documents": {},
        "rounds": [row],
        "round_id": "round",
        "round": row,
    }
    build, batch = (
        (application_evidence_sources, application_sections)
        if scope == "APPLICATION"
        else (evidence_sources, sections)
    )
    sources, _ = await build(data)
    batches = batch(sources)
    assert len(batches) > 1
    for part in batches:
        for field in ("scheduled_at", "completed_at", "outcome"):
            state = next(s for s in part if s["id"] == f"round:round:{field}:0")
            assert state["kind"] == "round" and state["text"] == row[field]
    prompt = _system_prompt(scope)
    assert "Treat it as past" in prompt
    assert "never suggest preparing for that same round" in prompt.lower()


def test_extraction_prompt_and_schema_keep_salary_basis_and_terms():
    assert "net/gross" in EXTRACTION_SYSTEM_PROMPT
    assert "per month/year/hour" in EXTRACTION_SYSTEM_PROMPT
    assert "no initial on-call duty" in EXTRACTION_SYSTEM_PROMPT
    assert "Do not invent terms" in EXTRACTION_SYSTEM_PROMPT
    description = "EUR 2200–2800 net per month; permanent full-time employment; no initial on-call duty."
    result = JobLeadExtractionInput.model_validate(
        {
            "title": "Engineer",
            "company": "Example",
            "description": description,
            "salary_min": 2200,
            "salary_max": 2800,
            "salary_currency": "EUR",
        }
    )
    assert result.description == description
