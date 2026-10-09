"""Status moves and explicit saved-requirement confirmation use the existing data model."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from tests.test_workspace_v030 import post
from tests.test_workspace_v030 import workspace as workspace

from app.models import Application, JobLead
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService


async def test_every_status_pair_preserves_sent_date_and_records_history(
    client, workspace
):
    _, headers, _, _, statuses = workspace
    for source, source_id in statuses.items():
        for destination, destination_id in statuses.items():
            app = await post(
                client,
                "/applications",
                {
                    "company": "North",
                    "job_title": "Engineer",
                    "status_id": source_id,
                    "applied_at": None if source == "preparing" else "2026-01-01",
                },
                headers,
            )
            patch = {
                "status_id": destination_id,
                "expected_revision": app["evidence_revision"],
                "status_changed_at": datetime.now(UTC).isoformat(),
                "status_comment": "Move",
                "status_reason": "Decision",
            }
            path = f"/api/applications/{app['id']}"
            if source == "preparing" and destination != "preparing":
                failed = await client.patch(path, json=patch, headers=headers)
                assert failed.status_code == 422, (source, destination, failed.text)
                patch["applied_at"] = "2026-01-02"
            response = await client.patch(path, json=patch, headers=headers)
            assert response.status_code == 200, (source, destination, response.text)
            updated = response.json()
            assert updated["status"]["id"] == destination_id
            assert updated["applied_at"] == (
                patch.get("applied_at") or app["applied_at"]
            )
            history = (await client.get(path + "/history", headers=headers)).json()
            if source != destination:
                entries = (
                    history if isinstance(history, list) else history.get("items", [])
                )
                assert any(
                    entry.get("from_status", {}).get("id") == source_id
                    and entry.get("to_status", {}).get("id") == destination_id
                    for entry in entries
                    if entry.get("from_status") and entry.get("to_status")
                )


@pytest.mark.parametrize("kind", ["application", "lead"])
async def test_confirm_requirements_is_explicit_scoped_revision_guarded_and_archived(
    client, db, workspace, kind
):
    user, headers, other, other_headers, statuses = workspace
    if kind == "application":
        record = await post(
            client,
            "/applications",
            {
                "company": "North",
                "job_title": "Engineer",
                "status_id": statuses["applied"],
                "requirements_must_have": ["Python"],
                "requirements_nice_to_have": ["SQL"],
            },
            headers,
        )
        model, revision = Application, "evidence_revision"
    else:
        record = await post(
            client,
            "/job-leads",
            {
                "title": "Engineer",
                "requirements_must_have": ["Python"],
                "requirements_nice_to_have": ["SQL"],
            },
            headers,
        )
        response = await client.patch(
            f"/api/job-leads/{record['id']}",
            json={
                "expected_revision": record["revision"],
                "requirements_must_have": ["Python"],
                "requirements_nice_to_have": ["SQL"],
            },
            headers=headers,
        )
        assert response.status_code == 200
        record = response.json()
        model, revision = JobLead, "revision"
    target = {f"{kind}_id": record["id"], "expected_revision": record[revision]}
    endpoint = "/api/job-analyses/confirm-requirements"
    assert (
        await client.post(endpoint, json=target, headers=other_headers)
    ).status_code == 404
    stale = {**target, "expected_revision": target["expected_revision"] + 1}
    assert (await client.post(endpoint, json=stale, headers=headers)).status_code == 409
    response = await client.post(endpoint, json=target, headers=headers)
    assert response.status_code == 200, response.text
    rows = response.json()["requirements"]
    assert [r["text"] for r in rows] == ["Python", "SQL"]
    assert all(
        r["source"] == "manual" and r["authorship"] == "user" and "quote" not in r
        for r in rows
    )
    assert (
        await client.post(endpoint, json=target, headers=headers)
    ).status_code == 409
    read = (
        await client.get(
            "/api/job-analyses",
            params={"kind": "PROFILE_MATCH", f"{kind}_id": record["id"]},
            headers=headers,
        )
    ).json()
    assert read["analysis"] is None and read["requirements"] == rows
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            user.id, session
        )
    )
    await db.run_sync(
        lambda session: ImportService(default_registry, IDMapper()).import_user_data(
            archive, other.id, session
        )
    )
    await db.commit()
    restored = await db.scalar(select(model).where(model.user_id == other.id))
    assert restored is not None
    assert [r["text"] for r in restored.confirmed_requirements] == ["Python", "SQL"]
    from app.services.requirement_insights import current_requirements

    restored.requirements_must_have = ["Go"]
    assert [r["text"] for r in current_requirements(restored)] == ["SQL"]


async def test_empty_requirements_cannot_be_confirmed(client, workspace):
    _, h, _, _, _ = workspace
    lead = await post(client, "/job-leads", {"title": "Engineer"}, h)
    response = await client.post(
        "/api/job-analyses/confirm-requirements",
        json={"lead_id": lead["id"], "expected_revision": lead["revision"]},
        headers=h,
    )
    assert response.status_code == 422
