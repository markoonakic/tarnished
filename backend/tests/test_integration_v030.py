"""Cross-feature activity uses owned records and preserves status identities."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select

from app.core.security import create_access_token
from app.core.seed import seed_defaults
from app.models import Application, ApplicationStatus, ApplicationStatusHistory, User
from app.models.workspace import Company, Contact, Note


async def test_company_last_activity_uses_related_records_and_owner_scope(db, client):
    await seed_defaults(db)
    user = User(email="activity@example.com", password_hash="unused")
    other = User(email="foreign@example.com", password_hash="unused")
    db.add_all([user, other])
    await db.flush()
    company = Company(user_id=user.id, name="North")
    empty = Company(user_id=user.id, name="Empty")
    db.add_all([company, empty])
    await db.flush()
    status = await db.scalar(
        select(ApplicationStatus).where(ApplicationStatus.meaning == "applied")
    )
    app = Application(
        user_id=user.id,
        company_id=company.id,
        company="North",
        job_title="Engineer",
        status_id=status.id,
        applied_at=date(2026, 1, 1),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 1, 2, tzinfo=UTC),
    )
    contact = Contact(
        user_id=user.id,
        company_id=company.id,
        name="Mira",
        created_at=datetime(2026, 1, 3, tzinfo=UTC),
        updated_at=datetime(2026, 1, 3, tzinfo=UTC),
    )
    db.add_all([app, contact])
    await db.flush()
    db.add_all(
        [
            Note(
                user_id=user.id,
                application_id=app.id,
                body="Private",
                created_at=datetime(2026, 1, 4, tzinfo=UTC),
                updated_at=datetime(2026, 1, 5, tzinfo=UTC),
            ),
            Note(
                user_id=other.id,
                company_id=company.id,
                body="Foreign",
                created_at=datetime(2026, 2, 1, tzinfo=UTC),
                updated_at=datetime(2026, 2, 1, tzinfo=UTC),
            ),
        ]
    )
    await db.commit()
    headers = {
        "Authorization": "Bearer "
        + create_access_token({"sub": user.id, "session_version": user.session_version})
    }
    response = await client.get("/api/companies?sort=activity", headers=headers)
    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert [row["id"] for row in rows] == [company.id, empty.id]
    assert rows[0]["last_activity_at"].startswith("2026-01-05")
    assert rows[1]["last_activity_at"] is None
    assert "Foreign" not in response.text
    profile = (await client.get("/api/profile", headers=headers)).json()
    changed = await client.put(
        "/api/profile",
        headers=headers,
        json={
            "expected_revision": profile["revision"],
            "desired_positions": ["Developer"],
        },
    )
    assert changed.status_code == 200, changed.text
    await db.refresh(app)
    assert app.updated_at.replace(tzinfo=UTC) == datetime(2026, 1, 2, tzinfo=UTC)
    rows = (await client.get("/api/companies?sort=activity", headers=headers)).json()[
        "items"
    ]
    assert rows[0]["last_activity_at"].startswith("2026-01-05")


async def test_activity_status_transition_keeps_builtin_identity_and_custom_name(
    db, client
):
    await seed_defaults(db)
    user = User(email="transitions@example.com", password_hash="unused")
    db.add(user)
    await db.flush()
    applied = await db.scalar(
        select(ApplicationStatus).where(ApplicationStatus.builtin_key == "applied")
    )
    custom = ApplicationStatus(
        user_id=user.id,
        name="Team review",
        normalized_name="team review",
        meaning="screening",
        color="blue",
        order=10,
    )
    db.add(custom)
    await db.flush()
    app = Application(
        user_id=user.id,
        company="North",
        job_title="Engineer",
        status_id=custom.id,
        applied_at=date(2026, 1, 1),
    )
    db.add(app)
    await db.flush()
    db.add(
        ApplicationStatusHistory(
            application_id=app.id,
            from_status_id=applied.id,
            to_status_id=custom.id,
            changed_at=datetime(2026, 1, 2, tzinfo=UTC),
        )
    )
    await db.commit()
    headers = {
        "Authorization": "Bearer "
        + create_access_token({"sub": user.id, "session_version": user.session_version})
    }
    response = await client.get("/api/analytics/history?period=all", headers=headers)
    assert response.status_code == 200, response.text
    row = next(
        item for item in response.json()["items"] if item["event"] == "status.changed"
    )
    assert row["from_status"] == {"name": "Applied", "builtin_key": "applied"}
    assert row["to_status"] == {"name": "Team review", "builtin_key": None}


@pytest.mark.parametrize(
    "meaning, expected_code", [("preparing", 200), ("applied", 422)]
)
async def test_only_preparing_can_clear_company_and_position(
    db, client, meaning, expected_code
):
    await seed_defaults(db)
    user = User(email="preparing-fields@example.com", password_hash="unused")
    db.add(user)
    await db.flush()
    status = await db.scalar(
        select(ApplicationStatus).where(ApplicationStatus.meaning == meaning)
    )
    app = Application(
        user_id=user.id,
        company="North",
        job_title="Engineer",
        status_id=status.id,
        status_meaning=meaning,
        applied_at=date(2026, 1, 1),
    )
    db.add(app)
    await db.commit()
    headers = {
        "Authorization": "Bearer "
        + create_access_token({"sub": user.id, "session_version": user.session_version})
    }
    response = await client.patch(
        f"/api/applications/{app.id}",
        headers=headers,
        json={
            "expected_revision": app.evidence_revision,
            "company": "",
            "job_title": " ",
            "location": "Beograd",
        },
    )
    assert response.status_code == expected_code, response.text
    await db.refresh(app)
    if meaning == "preparing":
        assert app.company == app.job_title == ""
        assert app.location == "Beograd"
    else:
        assert app.company == "North" and app.job_title == "Engineer"
