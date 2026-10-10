"""Regression checks for archive merge and preference restoration."""

from uuid import uuid4

from sqlalchemy import func, select
from tests.test_core_mutation_integrity import workspace as workspace

from app.models import JobLead
from app.models.workspace import Note
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService


async def test_merge_existing_lead_url_maps_children_without_changing_owned_lead(
    client, db, workspace
):
    owner = workspace[0]
    lead = (
        await client.post(
            "/api/job-leads",
            json={"url": "https://example.test/merge", "title": "Saved"},
        )
    ).json()
    await client.post("/api/notes", json={"lead_id": lead["id"], "body": "Linked note"})
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            owner.id, session
        )
    )
    assert (
        await client.patch(
            "/api/job-leads/" + lead["id"],
            json={"expected_revision": 0, "title": "Newer"},
        )
    ).status_code == 200
    mapper = IDMapper()
    service = ImportService(default_registry, mapper)
    await db.run_sync(
        lambda session: service.import_user_data(archive, owner.id, session)
    )
    await db.commit()
    assert mapper.get("JobLead", lead["id"]) == lead["id"]
    assert await db.scalar(select(func.count()).select_from(JobLead)) == 1
    await db.refresh(await db.get(JobLead, lead["id"]))
    assert (await db.get(JobLead, lead["id"])).title == "Newer"
    assert (
        await db.scalar(
            select(func.count()).select_from(Note).where(Note.lead_id == lead["id"])
        )
        == 2
    )


async def test_replace_restores_allowlisted_preferences_but_not_account_authority(
    db, workspace
):
    owner = workspace[0]
    owner.settings = {
        "time_zone_mode": "manual",
        "time_zone": "Pacific/Auckland",
        "private_setting": "keep",
    }
    await db.commit()
    archive = {
        "format_version": "2.0.0",
        "models": {
            "User": [
                {
                    "id": str(uuid4()),
                    "settings": {
                        "language": "sr-Latn",
                        "time_zone_mode": "manual",
                        "time_zone": "Europe/Belgrade",
                        "show_heatmap": False,
                        "private_setting": "discard",
                    },
                    "is_admin": False,
                }
            ]
        },
    }
    service = ImportService(default_registry, IDMapper())
    await db.run_sync(
        lambda session: service.import_user_data(
            archive, owner.id, session, override=True
        )
    )
    await db.commit()
    assert owner.settings["time_zone"] == "Europe/Belgrade"
    assert owner.settings["show_heatmap"] is False
    assert owner.settings["private_setting"] == "keep"
    assert owner.is_admin
