from datetime import UTC, datetime

import pytest

from app.models import Application, ApplicationStatus, User
from app.services.import_validation import validate_import_payload


@pytest.mark.asyncio
async def test_validate_import_payload_summarizes_new_format_and_existing_data(db):
    user = User(
        email="import-validation@example.com",
        password_hash="hashed",
        is_active=True,
    )
    status = ApplicationStatus(
        name="Applied",
        color="#83a598",
        is_default=True,
        user_id=None,
    )
    db.add_all([user, status])
    await db.commit()
    await db.refresh(user)
    await db.refresh(status)

    db.add(
        Application(
            user_id=user.id,
            company="Existing Co",
            job_title="Engineer",
            status_id=status.id,
            applied_at=datetime.now(UTC).date(),
        )
    )
    await db.commit()

    data = {
        "format_version": "1.0.0",
        "models": {
            "Application": [{"id": "app-1"}],
            "Round": [{"id": "round-1"}],
            "ApplicationStatusHistory": [{"id": "hist-1"}],
            "ApplicationStatus": [
                {"name": "Applied", "user_id": None},
                {"name": "Custom", "user_id": str(user.id)},
            ],
            "RoundType": [{"name": "Phone", "user_id": str(user.id)}],
            "JobLead": [{"id": "lead-1"}],
        },
    }

    response = await validate_import_payload(
        db,
        str(user.id),
        data,
        {"file_count": 8},
    )

    assert response.valid is True
    assert response.summary == {
        "applications": 1,
        "rounds": 1,
        "status_history": 1,
        "custom_statuses": 1,
        "custom_round_types": 1,
        "job_leads": 1,
        "files": 6,
    }
    assert any("existing applications" in warning for warning in response.warnings)


@pytest.mark.asyncio
async def test_validate_import_payload_summarizes_legacy_format_and_missing_statuses(
    db,
):
    user = User(
        email="legacy-validation@example.com",
        password_hash="hashed",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    data = {
        "user": {"email": "legacy@example.com"},
        "custom_statuses": [],
        "custom_round_types": [],
        "applications": [
            {
                "company": "Legacy Co",
                "job_title": "Backend Engineer",
                "job_description": None,
                "job_url": "https://example.com/jobs/1",
                "status": "Applied",
                "cv_path": None,
                "applied_at": "2026-03-24T00:00:00Z",
                "status_history": [
                    {
                        "from_status": None,
                        "to_status": "Applied",
                        "changed_at": "2026-03-24T00:00:00Z",
                        "note": None,
                    }
                ],
                "rounds": [],
            }
        ],
    }

    response = await validate_import_payload(
        db,
        str(user.id),
        data,
        {"file_count": 1},
    )

    assert response.valid is True
    assert response.summary == {
        "applications": 1,
        "rounds": 0,
        "status_history": 1,
        "custom_statuses": 0,
        "custom_round_types": 0,
        "files": 0,
    }
    assert any("new statuses" in warning for warning in response.warnings)
