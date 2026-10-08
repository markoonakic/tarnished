"""Activity labels use current owned records and exclude private audit text."""

import json
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.security import create_access_token
from app.core.seed import seed_defaults
from app.models import Application, ApplicationStatus, AuditLog, User
from app.models.workspace import Company


async def test_activity_labels_are_owner_scoped_and_private_text_free(db, client):
    await seed_defaults(db)
    user = User(
        email="activity-owner@example.com", password_hash="unused", is_admin=True
    )
    other = User(email="activity-other@example.com", password_hash="unused")
    db.add_all([user, other])
    await db.flush()
    status = await db.scalar(
        select(ApplicationStatus).where(ApplicationStatus.meaning == "applied")
    )
    app = Application(
        user_id=user.id,
        company="North",
        job_title="Engineer",
        status_id=status.id,
        applied_at=datetime.now(UTC).date(),
    )
    company = Company(user_id=user.id, name="Local")
    foreign = Company(user_id=other.id, name="Foreign private company")
    db.add_all([app, company, foreign])
    await db.flush()
    for kind, record in (
        ("application", app),
        ("company", company),
        ("company", foreign),
    ):
        db.add(
            AuditLog(
                user_id=user.id,
                event_type=f"workspace.{kind}.updated",
                details=json.dumps(
                    {
                        "target_type": kind,
                        "target_id": record.id,
                        "body": "Private note content",
                        "target_label": "Untrusted payload label",
                    }
                ),
            )
        )
    await db.commit()
    headers = {
        "Authorization": "Bearer "
        + create_access_token({"sub": user.id, "session_version": user.session_version})
    }
    response = await client.get("/api/analytics/history?period=all", headers=headers)
    assert response.status_code == 200
    data = response.json()
    labels = {item["target_id"]: item["target_label"] for item in data["items"]}
    assert labels[app.id] == "North"
    assert labels[company.id] == "Local"
    assert labels[foreign.id] is None
    assert "Private note content" not in response.text
    assert "Untrusted payload label" not in response.text
    assert "Foreign private company" not in response.text
    other_headers = {
        "Authorization": "Bearer "
        + create_access_token(
            {"sub": other.id, "session_version": other.session_version}
        )
    }
    assert (
        await client.get("/api/analytics/history?period=all", headers=other_headers)
    ).json()["items"] == []
