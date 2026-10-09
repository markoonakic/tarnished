import runpy
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from tests.test_job_analyses import saved_analysis
from tests.test_workspace_v030 import post
from tests.test_workspace_v030 import workspace as workspace

from app.models import Application, JobLead
from app.schemas.interview_feedback import Citation
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService
from app.services.interview_text import _localized_system_prompt


@pytest.mark.parametrize("scope", ["APPLICATION", "PIPELINE"])
@pytest.mark.parametrize("language", ["en", "sr-Latn"])
def test_feedback_prompt_keeps_the_strict_citation_bound(scope, language):
    prompt = _localized_system_prompt(scope, language)
    assert "Every citation.quote MUST contain at most 2000 characters" in prompt
    assert "do not copy the whole metrics object" in prompt
    with pytest.raises(ValidationError):
        Citation(source_id="metrics", quote="x" * 2001)
    assert Citation(source_id="metrics", quote="x" * 2000)


async def test_preparing_archive_keeps_unknown_sent_date(client, db, workspace):
    user, headers, other, _, statuses = workspace
    created = await post(
        client, "/applications", {"status_id": statuses["preparing"]}, headers
    )
    assert created["applied_at"] is None

    def round_trip(session):
        payload = ExportService(default_registry).export_user_data(user.id, session)
        mapper = IDMapper()
        ImportService(default_registry, mapper).import_user_data(
            payload, other.id, session
        )
        session.flush()
        restored = session.get(Application, mapper.get("Application", created["id"]))
        assert restored.applied_at is None
        assert restored.status_meaning == "preparing"

    await db.run_sync(round_trip)


async def test_migration_preserves_records_and_responses_project_reviewed_requirements(
    client, db, workspace
):
    _, headers, _, other_headers, _ = workspace
    records = []
    for owner_headers in (headers, other_headers):
        created = await post(
            client, "/job-leads", {"title": "Developer"}, owner_headers
        )
        lead = await db.get(JobLead, created["id"])
        lead.requirements_must_have = ["Basic Python", "Python"]
        lead.confirmed_requirements = [
            {"id": lead.id, "type": "must_have", "text": "Python"}
        ]
        records.append(lead)
    await db.commit()
    migration = runpy.run_path(
        str(Path(__file__).parents[1] / "alembic/versions/20261011_patch_defaults.py")
    )

    def apply(session):
        upgrade = migration["upgrade"]
        upgrade.__globals__["op"] = SimpleNamespace(
            get_bind=lambda: session.connection()
        )
        upgrade()

    await db.run_sync(apply)
    for lead in records:
        await db.refresh(lead)
        assert lead.requirements_must_have == ["Basic Python", "Python"]
        assert lead.confirmed_requirements[0]["id"] == lead.id
    for lead, owner_headers in zip(records, (headers, other_headers), strict=True):
        response = await client.get(f"/api/job-leads/{lead.id}", headers=owner_headers)
        assert response.status_code == 200
        assert response.json()["requirements_must_have"] == ["Python"]


async def test_review_replaces_legacy_requirement_projection(client, db, workspace):
    user, headers, _, _, _ = workspace
    created = await post(
        client,
        "/job-leads",
        {
            "title": "Developer",
            "text": "Junior Python developer. Work remotely. Python and SQL required.",
        },
        headers,
    )
    lead = await db.get(JobLead, created["id"])
    lead.requirements_must_have = ["Basic Python", "basic SQL"]
    lead.requirements_nice_to_have = ["Legacy extra"]
    await db.commit()
    analysis = await saved_analysis(db, user, lead)
    response = await client.patch(
        f"/api/job-analyses/{analysis.id}/review",
        headers=headers,
        json={
            "expected_revision": analysis.revision,
            "target_revision": lead.revision,
            "items": [{"id": "python", "decision": "accepted"}],
        },
    )
    assert response.status_code == 200, response.text
    await db.refresh(lead)
    assert lead.requirements_must_have == ["Python"]
    assert lead.requirements_nice_to_have == []
