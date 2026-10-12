"""Round-one regressions: constrained output, evidence size and atomic reads."""

import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from jsonschema import Draft202012Validator
from sqlalchemy import event, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_feedback_contract import admitted, envelope
from tests.test_pipeline_record_contract import built_sources, section_for
from tests.test_report_responses_protocol import responses_fixture, text_settings
from tests.test_report_validation_diagnostics import diagnostics as diagnostics

from app.models import InterviewJob, JobLead, Round
from app.models.job_analysis import JobAnalysis
from app.schemas.interview_feedback import PipelineOutputSection
from app.schemas.job_analysis import CreateAnalysis
from app.services import interview_jobs as jobs
from app.services import interview_text as text
from app.services import job_analyses as analyses
from app.services.interview_evidence import (
    fingerprint,
    pipeline_evidence_sources,
    pipeline_report_input,
)
from app.services.report_output import (
    MODELS,
    citation_choices,
    output_schema,
    resolve_citations,
)


@pytest.mark.parametrize("scope", list(MODELS))
def test_provider_schema_requires_every_field_and_forbids_unknown_fields(scope):
    sources = [{"data": {"profile": [], "posting": ""}}]
    schema = output_schema(
        scope, citation_choices(sources if scope != "PIPELINE" else [], scope)
    )
    Draft202012Validator.check_schema(schema)

    def checked(node):
        if isinstance(node, dict):
            assert "default" not in node
            if "properties" in node:
                assert set(node["required"]) == set(node["properties"])
                assert node["additionalProperties"] is False
            for value in node.values():
                checked(value)
        elif isinstance(node, list):
            for value in node:
                checked(value)

    checked(schema)


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_pipeline_selects_exact_citations_without_copying_or_repair(protocol):
    sources = await built_sources()
    original = section_for(sources)
    choices = citation_choices(sources, "PIPELINE")
    wire = PipelineOutputSection.model_validate(original).model_dump()
    selected = [
        next(key for key, value in choices.items() if value == citation)
        for citation in original["findings"][0]["citations"]
    ]
    wire["findings"][0]["citations"] = selected[:1]
    step = wire["findings"][0]["coaching"]["records"][0]
    step["application_choice"] = selected[step.pop("record_citation")]
    step["round_choices"] = [selected[index] for index in step.pop("round_citations")]
    schema = output_schema("PIPELINE", choices)
    Draft202012Validator(schema).validate(wire)
    missing = json.loads(json.dumps(wire))
    del missing["findings"][0]["subject"]
    assert list(Draft202012Validator(schema).iter_errors(missing))
    async with responses_fixture(body=envelope(wire, protocol)) as (endpoint, calls):
        result = await text.analyze_section(
            text_settings(endpoint, protocol), sources, [], "PIPELINE"
        )
    assert len(calls) == 1
    assert result == original
    assert result["findings"][0]["citations"] == original["findings"][0]["citations"]
    wire["findings"][0]["citations"][0] = "invented-choice"
    with pytest.raises(text.SectionValidationError):
        resolve_citations(wire, choices, "PIPELINE")
    changed = json.loads(json.dumps(original))
    changed["findings"][0]["citations"][1]["quote"] = changed["findings"][0][
        "citations"
    ][1]["quote"].replace("Example", "Invented")
    with pytest.raises(ValueError):
        text.validate_section(
            changed, sources, "PIPELINE", require_current_contract=True
        )


async def test_every_pipeline_choice_is_an_original_bounded_passage_in_one_source():
    data = {
        "profile": {},
        "metrics": {
            "total_applications": 355,
            "coverage": {"note": 'JSON punctuation { escaped " text', "history": 17},
            "repeated_requirements": [
                {"label": "Python", "count": n} for n in range(355)
            ],
            "applications": [
                {"application_id": str(UUID(int=1)), "company": 'Company {\\" name'}
            ],
        },
    }
    sources, _ = await pipeline_evidence_sources(data)
    lookup = {s["id"]: s for s in sources}
    choices = citation_choices(sources, "PIPELINE")
    assert len(choices) > 10
    for citation in choices.values():
        assert len(citation["quote"]) <= 2000
        assert citation["quote"] in lookup[citation["source_id"]]["text"]
        assert text.quote_matches(citation["quote"], lookup[citation["source_id"]])


@pytest.mark.parametrize("kind", ["PROFILE_MATCH", "PREPARATION"])
def test_profile_selections_keep_exact_spelling_and_permission_scope(kind, diagnostics):
    data = {
        "requirements": [{"id": "r1", "text": "Python"}],
        "profile": [{"id": "p1", "text": "Built Python tools.\nUsed SQL queries."}],
    }
    sources = [{"data": data}]
    choices = citation_choices(sources, kind)
    assert all(c["quote"] in data["profile"][0]["text"] for c in choices.values())
    evidence = [next(iter(choices))]
    if kind == "PROFILE_MATCH":
        wire = {
            "rows": [
                {
                    "requirement_id": "r1",
                    "state": "confirmed",
                    "why": "Saved Python work.",
                    "evidence": evidence,
                }
            ]
        }
    else:
        from app.schemas.job_analysis import CATEGORIES

        wire = {category: [] for category in CATEGORIES}
        wire["examples"] = [
            {
                "id": "one",
                "text": "Describe your Python tools.",
                "requirement_ids": ["r1"],
                "evidence": evidence,
            }
        ]
    output = resolve_citations(wire, choices, kind)
    assert text.validate_section(output, sources, kind)
    data["profile"] = []
    with text.validation_context(str(uuid4()), kind, 0), pytest.raises(ValueError):
        text.validate_section(output, sources, kind)
    assert diagnostics[-1]["rule"] == "reference.unknown_source"
    assert diagnostics[-1]["scope"] == kind


def test_review_scopes_log_schema_and_coverage_rules_without_source_text(diagnostics):
    sources = [{"data": {"profile": [], "requirements": [{"id": "private-id"}]}}]
    with pytest.raises(ValueError):
        text.validate_section({"rows": []}, sources, "PROFILE_MATCH")
    assert diagnostics[-1]["rule"] == "reference.requirement_coverage"
    with pytest.raises(ValueError):
        text.validate_section({"rows": [{}]}, sources, "PROFILE_MATCH")
    assert diagnostics[-1]["rule"] == "schema.missing"
    assert diagnostics[-1]["path"] == ["rows", 0, "requirement_id"]
    assert "private-id" not in json.dumps(diagnostics)


async def test_all_retains_the_same_model_input_not_unused_enriched_rows():
    data = {
        "period": "all",
        "as_of": "2026-10-12T12:00:00+00:00",
        "time_zone": "UTC",
        "profile": {"work_history": None, "skills": None},
        "metrics": {
            "total_applications": 355,
            "applications": [
                {
                    "application_id": str(UUID(int=n + 1)),
                    "company": f"Company {n}",
                    "job_title": "Engineer",
                    "current_meaning": "applied",
                    "source": "Referral",
                    "notes": "not a pipeline input " * 1000,
                    "history": [{"note": "not a pipeline input " * 1000}],
                    "job_description": "not a pipeline input " * 1000,
                    "gap_ids": ["gap"] if n % 2 else [],
                    "missing_prefix": False,
                }
                for n in range(355)
            ],
            "rounds": [
                {
                    "application_id": str(UUID(int=n + 1)),
                    "round_type": "Technical",
                    "transcript": "private " * 1000,
                }
                for n in range(355)
            ],
        },
    }
    assert len(json.dumps(data)) > 750000
    saved = pipeline_report_input(data)
    assert len(json.dumps(saved)) < 750000
    assert "not a pipeline input" not in json.dumps(saved)
    assert fingerprint(saved) == fingerprint(pipeline_report_input(data))
    assert await pipeline_evidence_sources(saved) == await pipeline_evidence_sources(
        data
    )
    sources, _, batches = await jobs._scope_evidence("PIPELINE", data)
    assert sources and batches


@pytest.mark.parametrize("kind", ["EXTRACTION", "PREPARATION"])
async def test_analysis_reads_published_draft_and_state_in_one_statement(
    db, workspace, kind
):
    user = workspace[0]
    if kind == "EXTRACTION":
        lead = JobLead(
            user_id=user.id, title="Developer", source_text="Python required."
        )
        db.add(lead)
        await db.commit()
        request = CreateAnalysis(kind=kind, lead_id=lead.id)
    else:
        interview = Round(application_id=workspace[4], round_type_id=workspace[3][0].id)
        db.add(interview)
        await db.commit()
        request = CreateAnalysis(
            kind=kind, application_id=workspace[4], round_id=interview.id
        )
    row = await analyses.create(db, user.id, request)
    row.input_revisions = {"permission": 0}
    job = InterviewJob(
        user_id=user.id,
        analysis_id=row.id,
        scope=kind,
        intent_id=str(uuid4()),
        state="analyzing",
        manifest={},
        required_scopes=[],
        generation=1,
        fingerprint="x",
        config_revision="0",
        provider="openai",
        model="fixture",
        session_version=user.session_version,
    )
    db.add(job)
    await db.commit()
    # Keep an old identity-mapped row while another transaction publishes.
    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    output = {
        "items": [
            {
                "id": "one",
                "field": "must_have",
                "value": "Python",
                "quote": "Python required.",
            }
        ]
    }
    if kind == "PREPARATION":
        from app.schemas.job_analysis import CATEGORIES

        output = {
            category: [
                {
                    "id": f"{category}-{n}",
                    "text": "Review saved Python work.",
                    "requirement_ids": ["r1"],
                    "evidence": [],
                }
                for n in range(3)
            ]
            for category in CATEGORIES
        }
    async with sessions() as writer:
        await writer.execute(
            update(JobAnalysis)
            .where(JobAnalysis.id == row.id)
            .values(draft=output, revision=2, review_state="ready")
        )
        await writer.execute(
            update(InterviewJob)
            .where(InterviewJob.id == job.id)
            .values(state="complete")
        )
        await writer.commit()
    result = await analyses.view(db, row)
    assert result["state"] == "complete"
    assert result["draft"] == output
    assert result["revision"] == 2


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
async def test_feedback_status_does_not_take_a_write_lock(
    scope, client, db, workspace, monkeypatch
):
    path, _, _, _ = await admitted(scope, client, db, workspace, monkeypatch)
    statements = []
    bind = db.get_bind()

    def capture(connection, cursor, statement, parameters, context, many):
        statements.append(statement.lstrip().split()[0].upper())

    event.listen(bind, "before_cursor_execute", capture)
    try:
        result = await client.get(path)
    finally:
        event.remove(bind, "before_cursor_execute", capture)
    assert result.status_code == 200
    assert not {"UPDATE", "INSERT", "DELETE"}.intersection(statements)


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_match_schema_requires_every_requirement_exactly_once(protocol):
    sources = [
        {
            "data": {
                "requirements": [
                    {"id": "r1", "text": "Python"},
                    {"id": "r2", "text": "SQL"},
                ],
                "profile": [{"id": "p1", "text": "Built Python tools."}],
            }
        }
    ]
    choices = citation_choices(sources, "PROFILE_MATCH")
    wire = {
        "rows": {
            "r1": {
                "state": "confirmed",
                "why": "Saved Python tools.",
                "evidence": [next(iter(choices))],
            },
            "r2": {
                "state": "no_evidence",
                "why": "No saved SQL evidence.",
                "evidence": [],
            },
        }
    }
    schema = output_schema("PROFILE_MATCH", choices, requirement_ids=["r1", "r2"])
    validator = Draft202012Validator(schema)
    validator.validate(wire)
    assert list(validator.iter_errors({"rows": {"r1": wire["rows"]["r1"]}}))
    assert list(
        validator.iter_errors({"rows": {**wire["rows"], "foreign": wire["rows"]["r1"]}})
    )
    async with responses_fixture(body=envelope(wire, protocol)) as (endpoint, calls):
        value = await text.analyze_section(
            text_settings(endpoint, protocol), sources, [], "PROFILE_MATCH"
        )
    assert len(calls) == 1
    assert {row["requirement_id"] for row in value["rows"]} == {"r1", "r2"}
    assert value["rows"][0]["evidence"][0]["quote"] == "Built Python tools."


@pytest.mark.parametrize("output", [None, [], {"findings": None}, {"rows": None}])
def test_selection_does_not_repair_invalid_shapes(output):
    for scope in ("PIPELINE", "PROFILE_MATCH", "PREPARATION"):
        assert resolve_citations(output, {}, scope) == output


@pytest.mark.parametrize("scope", ["EXTRACTION", "PROFILE_MATCH", "PREPARATION"])
async def test_review_executor_logs_job_identity_at_the_owning_site(
    scope, monkeypatch, diagnostics
):
    identity = str(uuid4())
    job = SimpleNamespace(scope=scope, manifest={"output_language": "en"})
    db = SimpleNamespace(commit=AsyncMock())

    @asynccontextmanager
    async def session():
        yield db

    monkeypatch.setattr(jobs, "guard", AsyncMock(return_value=(job, {}, None)))
    monkeypatch.setattr(analyses, "analyze_section", AsyncMock(return_value={}))
    with pytest.raises(ValueError):
        await analyses.execute(SimpleNamespace(sessions=session), identity, "claim")
    assert diagnostics[-1]["job_id"] == identity
    assert diagnostics[-1]["scope"] == scope
    assert diagnostics[-1]["section_index"] == 0
    assert diagnostics[-1]["rule"] == "schema.missing"


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_extraction_selects_original_posting_text_without_copying(protocol):
    sources = [{"data": {"posting": "Use .NET and Node.js.\nWe offer paid leave."}}]
    choices = citation_choices(sources, "EXTRACTION")
    assert choices[0] == {"quote": "Use .NET and Node.js."}
    from tests.test_extraction_value_contract import item, wire_items

    wire = wire_items(item("must_have", ".NET and Node.js", 0))
    Draft202012Validator(output_schema("EXTRACTION", choices)).validate(wire)
    async with responses_fixture(body=envelope(wire, protocol)) as (endpoint, calls):
        result = await text.analyze_section(
            text_settings(endpoint, protocol), sources, [], "EXTRACTION"
        )
    assert len(calls) == 1
    assert result["items"][0]["quote"] == "Use .NET and Node.js."
    wire["items"]["must_have"][0]["quote"] = 99
    with pytest.raises(text.SectionValidationError):
        resolve_citations(wire, choices, "EXTRACTION")


def test_expanded_selections_keep_the_existing_section_byte_bound(diagnostics):
    choices = {0: {"profile_id": "one", "quote": "x" * 2000}}
    output = {"rows": [{"evidence": [0] * 51}]}
    with pytest.raises(text.SectionValidationError):
        text._validate_provider_section(output, choices, [], "PROFILE_MATCH")
    assert diagnostics[-1]["rule"] == "bounds.section_output"


def test_preparation_keeps_requirement_membership_checks_local(diagnostics):
    from app.schemas.job_analysis import CATEGORIES

    # Repeated UUID enums reject the whole schema on compatible text services.
    schema = output_schema("PREPARATION", {}, requirement_ids=["r1"])
    assert schema["$defs"]["RequirementDraftItem"]["properties"]["requirement_ids"][
        "items"
    ] == {"type": "string"}
    output = {category: [] for category in CATEGORIES}
    output["practice_questions"] = [
        {
            "id": "one",
            "text": "Review this topic.",
            "requirement_ids": ["foreign"],
            "evidence": [],
        }
    ]
    sources = [{"data": {"requirements": [{"id": "r1"}], "profile": []}}]
    with pytest.raises(text.SectionValidationError):
        text.validate_section(output, sources, "PREPARATION")
    assert diagnostics[-1]["rule"] == "reference.unknown_requirement"


def test_extraction_distinguishes_benefits_from_candidate_requirements():
    prompt = analyses.prompt("EXTRACTION")
    assert "Employer benefits" in prompt
    assert "NOT candidate requirements or other_conditions" in prompt
    assert "offer of training" in prompt
