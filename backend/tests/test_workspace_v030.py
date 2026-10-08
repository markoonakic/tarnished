"""Owner isolation and full manual workflows on real migrated databases."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from app.core.seed import seed_defaults
from app.models import Application, ApplicationStatus, User
from app.models.workspace import Company, Contact, Note
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService
from app.services.profile_items import allowed_profile

PASSWORD = "workspace password 123"


async def owner(db, email, admin=False):
    user = User(email=email, password_hash=get_password_hash(PASSWORD), is_admin=admin)
    db.add(user)
    await db.commit()
    return user, {
        "Authorization": "Bearer "
        + create_access_token({"sub": user.id, "session_version": user.session_version})
    }


@pytest.fixture
async def workspace(db, client):
    await seed_defaults(db)
    user, headers = await owner(db, "one@example.com", True)
    other, other_headers = await owner(db, "two@example.com")
    statuses = {
        row.meaning: row.id
        for row in await db.scalars(
            select(ApplicationStatus).where(ApplicationStatus.user_id.is_(None))
        )
    }
    return user, headers, other, other_headers, statuses


async def post(client, path, data, headers):
    response = await client.post("/api" + path, json=data, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


async def test_application_responses_keep_sqlite_instants_in_utc(client, workspace):
    _, headers, _, _, statuses = workspace
    company = await post(client, "/companies", {"name": "North"}, headers)
    app = await post(
        client,
        "/applications",
        {
            "company": "North",
            "company_id": company["id"],
            "job_title": "Engineer",
            "status_id": statuses["applied"],
        },
        headers,
    )
    types = (await client.get("/api/round-types", headers=headers)).json()
    await post(
        client,
        f"/applications/{app['id']}/rounds",
        {
            "round_type_id": types[0]["id"],
            "scheduled_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        },
        headers,
    )
    overview = (await client.get("/api/dashboard/overview", headers=headers)).json()
    recent = overview["recent_applications"][0]
    board = (await client.get("/api/applications/board", headers=headers)).json()
    card = next(item for col in board["columns"] for item in col["items"])
    company = (
        await client.get(f"/api/companies/{company['id']}", headers=headers)
    ).json()
    archived = await client.patch(
        f"/api/applications/{app['id']}",
        json={"archived": True, "expected_revision": app["evidence_revision"]},
        headers=headers,
    )
    assert archived.status_code == 200
    for row in (app, recent, archived.json(), card, company):
        for field in (
            "created_at",
            "updated_at",
            "archived_at",
            "next_interview_at",
            "last_activity_at",
        ):
            if row.get(field):
                instant = datetime.fromisoformat(row[field].replace("Z", "+00:00"))
                assert instant.tzinfo is not None, field
                assert instant.utcoffset() == timedelta(0), field


async def test_companies_contacts_notes_and_owner_isolation(client, db, workspace):
    user, h, other, oh, statuses = workspace
    company = await post(client, "/companies", {"name": " North "}, h)
    assert company["name"] == "North"
    contact = await post(
        client,
        "/contacts",
        {"name": "Mira", "company_id": company["id"], "role": "Recruiter"},
        h,
    )
    assert (
        await client.post(
            "/api/contacts",
            json={"name": "Hidden", "company_id": company["id"]},
            headers=oh,
        )
    ).status_code == 404
    app = await post(
        client,
        "/applications",
        {
            "company": "North",
            "job_title": "Engineer",
            "company_id": company["id"],
            "status_id": statuses["applied"],
        },
        h,
    )
    response = await client.put(
        f"/api/applications/{app['id']}/contacts",
        json={"contact_ids": [contact["id"]], "expected_revision": 0},
        headers=h,
    )
    assert response.status_code == 200, response.text
    assert response.json()["contact_ids"] == [contact["id"]]
    note = await post(
        client,
        "/notes",
        {"application_id": app["id"], "body": "Private line\nSecond line"},
        h,
    )
    assert (
        await client.get(
            f"/api/notes?target_type=application&target_id={app['id']}", headers=oh
        )
    ).status_code == 404
    assert (
        await client.patch(
            f"/api/notes/{note['id']}",
            json={"body": "edit", "expected_revision": 1},
            headers=h,
        )
    ).status_code == 409
    assert (
        await client.patch(
            f"/api/notes/{note['id']}",
            json={"body": "edit", "expected_revision": 0},
            headers=h,
        )
    ).status_code == 200
    assert (
        await client.post(
            "/api/notes",
            json={
                "company_id": company["id"],
                "contact_id": contact["id"],
                "body": "two",
            },
            headers=h,
        )
    ).status_code == 422
    assert (
        await client.delete(
            f"/api/companies/{company['id']}?expected_revision=0", headers=h
        )
    ).status_code == 204
    await db.refresh(await db.get(Application, app["id"]))
    saved = await db.get(Application, app["id"])
    assert saved.company_id is None and saved.company == "North"
    assert (await client.get("/api/contacts", headers=oh)).json()["total"] == 0


async def test_manual_leads_filters_source_conversion_status_archive(
    client, db, workspace
):
    user, h, _, oh, statuses = workspace
    lead = await post(
        client,
        "/job-leads",
        {
            "title": "Backend",
            "company": "North",
            "work_mode": "remote",
            "priority": "high",
            "tags": ["Python"],
            "text": "x" * 70000,
        },
        h,
    )
    assert lead["url"] is None and len(lead["source_text"]) == 70000
    assert not lead["source_truncated"]
    assert (
        await client.get("/api/job-leads?work_mode=remote&tags=Python", headers=h)
    ).json()["total"] == 1
    assert (await client.get("/api/job-leads?tags=Py", headers=h)).json()["total"] == 0
    response = await client.put(
        f"/api/job-leads/{lead['id']}/source",
        json={"expected_revision": 0, "text": "New source"},
        headers=h,
    )
    assert response.status_code == 200, response.text
    response = await client.post(f"/api/job-leads/{lead['id']}/convert", headers=h)
    assert response.status_code == 201, response.text
    app = response.json()
    assert (
        app["priority"] == "high"
        and app["tags"] == ["Python"]
        and app["source_text"] == "New source"
    )
    response = await client.patch(
        f"/api/applications/{app['id']}",
        json={
            "expected_revision": 0,
            "status_id": statuses["rejected"],
            "status_comment": "Close",
            "status_reason": "Position filled",
            "status_changed_at": (datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
        },
        headers=h,
    )
    assert response.status_code == 200, response.text
    assert response.json()["outcome_reason"] == "Position filled"
    history = (
        await client.get(f"/api/applications/{app['id']}/history", headers=h)
    ).json()
    assert any(
        row["reason"] == "Position filled" and row["note"] == "Close" for row in history
    )
    assert (
        await client.patch(
            f"/api/applications/{app['id']}",
            json={"expected_revision": 0, "archived": True},
            headers=h,
        )
    ).status_code == 409
    assert (
        await client.patch(
            f"/api/applications/{app['id']}",
            json={"expected_revision": 1, "archived": True},
            headers=h,
        )
    ).status_code == 200
    assert (await client.get("/api/applications", headers=h)).json()["total"] == 0
    assert (await client.get("/api/applications?show_archived=true", headers=h)).json()[
        "total"
    ] == 1
    board = (await client.get("/api/applications/board", headers=h)).json()
    assert sum(column["count"] for column in board["columns"]) == 0
    draft = await post(client, "/applications", {"status_id": statuses["preparing"]}, h)
    assert draft["applied_at"] is None
    assert (
        await client.patch(
            f"/api/applications/{draft['id']}",
            json={"expected_revision": 0, "status_id": statuses["applied"]},
            headers=h,
        )
    ).status_code == 422


@pytest.mark.parametrize(
    "kind",
    [
        "application_deadline",
        "reply_to_company",
        "interview",
        "interview_preparation",
        "task_submission",
        "recruiter_follow_up",
        "expected_feedback",
    ],
)
async def test_reminders_retry_completion_and_tasks(client, db, workspace, kind):
    user, h, _, oh, _ = workspace
    payload = {
        "kind": kind,
        "title": "Follow up",
        "due_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
        "intent_id": str(uuid4()),
    }
    reminder = await post(client, "/reminders", payload, h)
    assert (await post(client, "/reminders", payload, h))["id"] == reminder["id"]
    assert (
        await client.post(
            "/api/reminders", json={**payload, "title": "Changed"}, headers=h
        )
    ).status_code == 409
    assert (
        await client.patch(
            f"/api/reminders/{reminder['id']}",
            json={"expected_revision": 0, "state": "done"},
            headers=oh,
        )
    ).status_code == 404
    task_data = (await client.get("/api/tasks", headers=h)).json()
    assert task_data["badge"]["overdue"] == 1
    assert (
        await client.patch(
            f"/api/reminders/{reminder['id']}",
            json={"expected_revision": 0, "state": "done"},
            headers=h,
        )
    ).status_code == 200
    assert (await client.get("/api/tasks", headers=h)).json()["total"] == 0
    assert (await client.get("/api/tasks?state=done", headers=h)).json()["total"] == 1
    assert (await client.get("/api/dashboard/overview", headers=h)).status_code == 200


async def test_reminder_dst_is_explicit(client, workspace):
    _, h, _, _, _ = workspace
    base = {
        "kind": "interview",
        "title": "Call",
        "time_zone": "America/New_York",
        "intent_id": str(uuid4()),
    }
    for day in ("2026-03-08", "2026-11-01"):
        response = await client.post(
            "/api/reminders",
            json={
                **base,
                "due_date": day,
                "due_time": "02:30" if "03-08" in day else "01:30",
            },
            headers=h,
        )
        assert response.status_code == 422, response.text


async def test_profile_ids_permissions_and_legacy_ai(client, db, workspace):
    user, h, _, _, _ = workspace
    response = await client.put(
        "/api/profile",
        json={
            "expected_revision": 0,
            "first_name": "Private",
            "skills": ["Python"],
            "work_history": [
                {"title": "Engineer", "company": "North", "legacy_key": "keep"}
            ],
            "projects": [{"name": "Tool", "description": "Built a tool"}],
        },
        headers=h,
    )
    assert response.status_code == 200, response.text
    profile = response.json()
    item_id = profile["work_history"][0]["id"]
    assert (
        profile["skill_items"][0]["id"]
        and profile["work_history"][0]["legacy_key"] == "keep"
    )
    response = await client.put(
        "/api/profile",
        json={
            "expected_revision": 1,
            "ai_permissions": {item_id: False, "skills": False},
        },
        headers=h,
    )
    assert response.status_code == 200, response.text
    from app.models import UserProfile
    from app.services.profile_items import legacy_ai_profile

    saved = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    await db.refresh(saved)
    permitted = allowed_profile(saved)
    assert (
        "first_name" not in permitted
        and not permitted.get("work_history")
        and not permitted.get("skill_items")
    )
    assert (await legacy_ai_profile(db, user.id)) == {
        "work_history": None,
        "skills": None,
    }
    assert (
        await client.put(
            "/api/profile",
            json={"expected_revision": 1, "display_name": "Stale"},
            headers=h,
        )
    ).status_code == 409
    response = await client.put(
        "/api/profile",
        json={
            "expected_revision": 2,
            "work_history": [{"id": item_id, "title": "Updated", "legacy_key": "keep"}],
        },
        headers=h,
    )
    assert response.status_code == 200
    assert response.json()["ai_permissions"][item_id] is False


async def test_account_requests_last_login_approval_self_delete(client, db, workspace):
    user, h, other, oh, _ = workspace
    response = await client.post(
        "/api/auth/register",
        json={"email": "pending@example.com", "password": PASSWORD, "is_admin": True},
    )
    assert response.status_code == 202, response.text
    pending = await db.scalar(select(User).where(User.email == "pending@example.com"))
    assert pending.approval_pending and not pending.is_active and not pending.is_admin
    duplicate = await client.post(
        "/api/auth/register", json={"email": user.email, "password": PASSWORD}
    )
    assert duplicate.json() == response.json()
    attempt = await client.post(
        "/api/auth/login", json={"email": pending.email, "password": PASSWORD}
    )
    assert attempt.status_code == 403 and attempt.json()["code"] == "account_pending"
    assert (await client.get("/api/admin/users?state=pending", headers=h)).json()[
        "total"
    ] == 1
    assert (await client.get("/api/admin/stats", headers=h)).json()[
        "pending_users"
    ] == 1
    response = await client.patch(
        f"/api/admin/users/{pending.id}", json={"approval_pending": False}, headers=h
    )
    assert response.status_code == 200 and response.json()["is_active"]
    assert (
        await client.post(
            "/api/auth/login", json={"email": pending.email, "password": PASSWORD}
        )
    ).status_code == 200
    await db.refresh(pending)
    assert pending.last_login_at is not None
    assert (
        await client.request(
            "DELETE",
            "/api/auth/me",
            json={"current_password": PASSWORD, "confirm": True},
            headers=h,
        )
    ).status_code == 409
    company = await post(client, "/companies", {"name": "Owned"}, oh)
    await post(client, "/notes", {"company_id": company["id"], "body": "Private"}, oh)
    assert (
        await client.request(
            "DELETE",
            "/api/auth/me",
            json={"current_password": PASSWORD, "confirm": True},
            headers=oh,
        )
    ).status_code == 204
    assert await db.scalar(select(Company).where(Company.user_id == other.id)) is None
    assert (await client.get("/api/auth/me", headers=oh)).status_code == 401


async def test_workspace_archive_roundtrip_and_denied_profile(client, db, workspace):
    user, h, other, _, statuses = workspace
    company = await post(
        client, "/companies", {"name": "North", "culture_notes": "Quiet"}, h
    )
    contact = await post(
        client, "/contacts", {"name": "Mira", "company_id": company["id"]}, h
    )
    lead = await post(
        client, "/job-leads", {"title": "Backend", "company_id": company["id"]}, h
    )
    await post(
        client, "/notes", {"contact_id": contact["id"], "body": "Private note"}, h
    )
    await post(
        client,
        "/reminders",
        {
            "lead_id": lead["id"],
            "title": "Deadline",
            "kind": "application_deadline",
            "due_at": datetime.now(UTC).isoformat(),
            "intent_id": str(uuid4()),
        },
        h,
    )
    await client.put("/api/profile", json={"skills": ["Python"]}, headers=h)
    data = await db.run_sync(
        lambda s: ExportService(default_registry).export_user_data(user.id, s)
    )
    assert data["models"]["Company"][0]["culture_notes"] == "Quiet"
    mapper = IDMapper()
    result = await db.run_sync(
        lambda s: ImportService(default_registry, mapper).import_user_data(
            data, other.id, s
        )
    )
    await db.commit()
    assert result["counts"]["Note"] == 1
    imported_note = await db.scalar(select(Note).where(Note.user_id == other.id))
    imported_contact = await db.scalar(
        select(Contact).where(Contact.user_id == other.id)
    )
    assert imported_note.contact_id == imported_contact.id != contact["id"]
    from app.models import UserProfile

    profile = await db.scalar(
        select(UserProfile).where(UserProfile.user_id == other.id)
    )
    assert profile.skills == ["Python"] and not allowed_profile(profile)


async def test_interview_fields_contacts_calendar_and_analytics(client, db, workspace):
    _, h, _, oh, statuses = workspace
    from app.models import RoundType

    round_type = await db.scalar(select(RoundType.id))
    app = await post(
        client,
        "/applications",
        {
            "company": "North",
            "job_title": " Engineer ",
            "status_id": statuses["applied"],
            "skills": ["Python", " python "],
        },
        h,
    )
    contact = await post(client, "/contacts", {"name": "Mira"}, h)
    rnd = await post(
        client,
        f"/applications/{app['id']}/rounds",
        {
            "round_type_id": round_type,
            "scheduled_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            "time_zone": "Europe/Belgrade",
            "duration_minutes": 60,
            "mode": "video",
            "meeting_url": "https://example.org/meeting",
            "contact_ids": [contact["id"]],
            "preparation": {"review_topics": ["Python"]},
            "questions_answers": [{"question": "Why?", "answer": "Reason"}],
            "task_description": "Build a tool",
        },
        h,
    )
    assert rnd["contact_ids"] == [contact["id"]]
    assert (await client.get(f"/api/rounds/{rnd['id']}", headers=oh)).status_code == 404
    assert (await client.get("/api/rounds?state=upcoming", headers=h)).json()[
        "total"
    ] == 1
    assert (
        await client.patch(
            f"/api/rounds/{rnd['id']}",
            json={"expected_revision": 2, "impressions": "Stale"},
            headers=h,
        )
    ).status_code == 409
    response = await client.get("/api/analytics/breakdowns?period=all", headers=h)
    assert response.status_code == 200, response.text
    assert response.json()["top_technologies"] == [{"label": "Python", "count": 1}]
    assert response.json()["top_positions"] == [{"label": "Engineer", "count": 1}]
    response = await client.get(
        "/api/analytics/history?period=all&per_page=1", headers=h
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] >= 3 and len(response.json()["items"]) == 1
    assert "Private" not in response.text
