"""An explicit interview zone does not depend on the browser's zone."""

from datetime import datetime

from sqlalchemy import select
from test_workspace_v030 import post
from test_workspace_v030 import workspace as workspace

from app.models import RoundType


async def test_explicit_round_zone_and_task_deadline_roundtrip(client, db, workspace):
    _, headers, _, _, statuses = workspace
    application = await post(
        client,
        "/applications",
        {"company": "North", "job_title": "Engineer", "status_id": statuses["applied"]},
        headers,
    )
    round_type = await db.scalar(select(RoundType.id))
    data = {
        "round_type_id": round_type,
        "time_zone": "America/New_York",
        "scheduled_at": "2026-03-08T03:30:00",
        "task_deadline": "2026-03-10T09:00:00Z",
    }
    path = f"/api/applications/{application['id']}/rounds"
    invalid = await client.post(
        path, json={**data, "scheduled_at": "2026-03-08T02:30:00"}, headers=headers
    )
    assert invalid.status_code == 422
    response = await client.post(path, json=data, headers=headers)
    assert response.status_code == 201, response.text
    saved = response.json()
    assert (
        datetime.fromisoformat(saved["scheduled_at"]).isoformat()
        == "2026-03-08T07:30:00+00:00"
    )
    assert (
        datetime.fromisoformat(saved["task_deadline"]).isoformat()
        == "2026-03-10T09:00:00+00:00"
    )
    changed = await client.patch(
        f"/api/rounds/{saved['id']}",
        json={
            "expected_revision": 0,
            "time_zone": "Europe/Belgrade",
            "scheduled_at": "2026-03-29T03:30:00",
        },
        headers=headers,
    )
    assert changed.status_code == 200, changed.text
    assert (
        datetime.fromisoformat(changed.json()["scheduled_at"]).isoformat()
        == "2026-03-29T01:30:00+00:00"
    )
