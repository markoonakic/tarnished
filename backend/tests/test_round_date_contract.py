"""Round and application dates through actual routers on both shared DB dialects."""

from datetime import UTC, datetime

import pytest
from tests.test_core_mutation_integrity import workspace as workspace


@pytest.mark.parametrize(
    "zone,wall,expected",
    [
        ("Asia/Tokyo", "2026-01-02T00:30:27", "2026-01-01T15:30:27Z"),
        ("America/Los_Angeles", "2026-01-01T23:30:15", "2026-01-02T07:30:15Z"),
        ("America/New_York", "2026-03-08T03:30:00", "2026-03-08T07:30:00Z"),
        ("America/New_York", "2026-11-01T01:30:00", "2026-11-01T05:30:00Z"),
        ("America/New_York", "2026-11-01T01:30:27-05:00", "2026-11-01T06:30:27Z"),
        ("Asia/Tokyo", "2026-01-02T00:30:00+09:00", "2026-01-01T15:30:00Z"),
    ],
)
async def test_round_dates_round_trip(client, db, workspace, zone, wall, expected):
    owner, _, _, types, app_id = workspace
    # The manual preference must override a conflicting browser/CLI header.
    owner.settings = {"time_zone_mode": "manual", "time_zone": zone}
    await db.commit()
    client.headers["Time-Zone"] = "Pacific/Honolulu"
    response = await client.post(
        f"/api/applications/{app_id}/rounds",
        json={
            "round_type_id": types[0].id,
            "scheduled_at": wall,
            "transcript_summary": "keep",
        },
    )
    assert response.status_code == 201, response.text
    round_id = response.json()["id"]
    assert response.json()["scheduled_at"] == expected
    response = await client.patch(
        f"/api/rounds/{round_id}", json={"completed_at": wall}
    )
    assert response.status_code == 200, response.text
    assert response.json()["completed_at"] == expected
    # Force ORM reload: this is evidence of persisted SQLite/PG values, not just response objects.
    db.expire_all()
    rounds = (await client.get(f"/api/applications/{app_id}")).json()["rounds"]
    assert rounds[0]["scheduled_at"] == expected
    assert rounds[0]["completed_at"] == expected
    response = await client.patch(
        f"/api/rounds/{round_id}", json={"notes_summary": "changed"}
    )
    assert response.json()["scheduled_at"] == expected
    assert response.json()["completed_at"] == expected
    assert response.json()["transcript_summary"] == "keep"
    response = await client.patch(
        f"/api/rounds/{round_id}", json={"scheduled_at": None, "completed_at": None}
    )
    assert response.json()["scheduled_at"] is None
    assert response.json()["completed_at"] is None


async def test_round_gap_and_missing_zone_are_actionable_and_atomic(
    client, db, workspace
):
    _, _, _, types, app_id = workspace
    path = f"/api/applications/{app_id}/rounds"
    response = await client.post(
        path, json={"round_type_id": types[0].id, "scheduled_at": "2026-03-08T02:30:00"}
    )
    assert response.status_code == 422
    assert "Time-Zone" in response.json()["detail"]
    client.headers["Time-Zone"] = "America/New_York"
    response = await client.post(
        path, json={"round_type_id": types[0].id, "scheduled_at": "2026-03-08T02:30:00"}
    )
    assert response.status_code == 422
    assert "does not exist" in response.json()["detail"]
    assert (await client.get(f"/api/applications/{app_id}")).json()["rounds"] == []
    response = await client.post(
        path, json={"round_type_id": types[0].id, "scheduled_at": "2026-03-08T01:30:00"}
    )
    round_id = response.json()["id"]
    response = await client.patch(
        f"/api/rounds/{round_id}",
        json={
            "scheduled_at": "2026-03-08T02:30:00",
            "notes_summary": "must not commit",
        },
    )
    assert response.status_code == 422
    current = (await client.get(f"/api/applications/{app_id}")).json()["rounds"][0]
    assert current["scheduled_at"] == "2026-03-08T06:30:00Z"
    assert current["notes_summary"] is None


async def test_application_default_dates_honor_zone_and_explicit_dates(
    client, db, workspace, monkeypatch
):
    from app.services import user_time

    owner, _, statuses, _, _ = workspace
    monkeypatch.setattr(
        user_time, "_utc_now", lambda: datetime(2026, 1, 1, 1, 30, tzinfo=UTC)
    )
    for zone, expected in [
        ("America/Los_Angeles", "2025-12-31"),
        ("Asia/Tokyo", "2026-01-01"),
    ]:
        client.headers["Time-Zone"] = zone
        body = {
            "company": "Date test",
            "job_title": "Role",
            "status_id": statuses[0].id,
        }
        response = await client.post("/api/applications", json=body)
        assert response.status_code == 201, response.text
        assert response.json()["applied_at"] == expected
        response = await client.post(
            "/api/applications", json={**body, "applied_at": "2024-02-29"}
        )
        assert response.json()["applied_at"] == "2024-02-29"
    owner.settings = {"time_zone_mode": "manual", "time_zone": "America/Los_Angeles"}
    await db.commit()
    response = await client.post("/api/applications", json=body)
    assert response.json()["applied_at"] == "2025-12-31"


async def test_failed_transcript_upload_can_retry_existing_round(client, db, workspace):
    _, _, _, types, app_id = workspace
    response = await client.post(
        f"/api/applications/{app_id}/rounds",
        json={"round_type_id": types[0].id, "transcript_summary": "survives"},
    )
    round_id = response.json()["id"]
    path = f"/api/rounds/{round_id}/transcript"
    response = await client.post(
        path, files={"file": ("bad.pdf", b"\x00" * 32, "application/pdf")}
    )
    assert 400 <= response.status_code < 500, response.text
    response = await client.post(
        path,
        files={
            "file": (
                "good.pdf",
                b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
                "application/pdf",
            )
        },
    )
    assert response.status_code == 200, response.text
    db.expire_all()
    rounds = (await client.get(f"/api/applications/{app_id}")).json()["rounds"]
    assert len(rounds) == 1
    assert rounds[0]["id"] == round_id
    assert rounds[0]["transcript_summary"] == "survives"
    assert rounds[0]["transcript_path"]


async def test_round_expected_zone_conflict_is_atomic_and_unchanged_dates_are_safe(
    client, db, workspace
):
    owner, _, _, types, app_id = workspace
    path = f"/api/applications/{app_id}/rounds"
    client.headers["Time-Zone"] = "Pacific/Honolulu"
    client.headers["Expected-Round-Time-Zone"] = "America/New_York"
    owner.settings = {"time_zone_mode": "manual", "time_zone": "America/New_York"}
    await db.commit()
    response = await client.post(
        path,
        json={
            "round_type_id": types[0].id,
            "scheduled_at": "2026-11-01T01:30:27-05:00",
        },
    )
    assert response.status_code == 201, response.text
    round_id = response.json()["id"]
    # A different tab/client changes preferences while the editor cache stays stale.
    owner.settings = {"time_zone_mode": "manual", "time_zone": "Asia/Tokyo"}
    await db.commit()
    response = await client.post(
        path,
        json={"round_type_id": types[0].id, "scheduled_at": "2026-11-01T01:30:00"},
    )
    assert response.status_code == 409, response.text
    assert "Reload time zone preferences" in response.json()["detail"]
    for field in ("scheduled_at", "completed_at"):
        response = await client.patch(
            f"/api/rounds/{round_id}",
            json={field: "2026-11-01T01:30:00", "notes_summary": "must not commit"},
        )
        assert response.status_code == 409, response.text
    db.expire_all()
    rounds = (await client.get(f"/api/applications/{app_id}")).json()["rounds"]
    assert len(rounds) == 1
    assert rounds[0]["notes_summary"] is None
    assert rounds[0]["scheduled_at"] == "2026-11-01T06:30:27Z"
    assert rounds[0]["completed_at"] is None
    for payload in (
        {"notes_summary": "safe unchanged dates"},
        {"completed_at": None},
        {"completed_at": "2026-11-01T01:30:15-05:00"},
    ):
        response = await client.patch(f"/api/rounds/{round_id}", json=payload)
        assert response.status_code == 200, response.text
        assert response.json()["scheduled_at"] == "2026-11-01T06:30:27Z"
    # Confirmed new zone succeeds; the device header still does not override manual.
    client.headers["Expected-Round-Time-Zone"] = "Asia/Tokyo"
    response = await client.patch(
        f"/api/rounds/{round_id}", json={"completed_at": "2026-11-01T15:30:00"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["completed_at"] == "2026-11-01T06:30:00Z"
    response = await client.post(
        path,
        json={"round_type_id": types[0].id, "scheduled_at": "2026-11-01T15:30:00"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["scheduled_at"] == "2026-11-01T06:30:00Z"
