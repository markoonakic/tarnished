"""Regression checks for the third release QA pass."""

import pytest
from tests.test_core_mutation_integrity import workspace as workspace


async def test_stale_api_key_edit_cannot_restore_removed_permissions(
    client, db, workspace
):
    first = (
        await client.post("/api/settings/api-keys", json={"label": "Original"})
    ).json()
    path = "/api/settings/api-keys/" + first["id"]
    restricted = await client.patch(
        path, json={"preset": "read_only", "expected_revision": first["revision"]}
    )
    assert restricted.status_code == 200
    stale = await client.patch(
        path,
        json={
            "label": "Stale",
            "preset": "full_access",
            "expected_revision": first["revision"],
        },
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "settings_changed"
    saved = (await client.get("/api/settings/api-keys")).json()[0]
    assert saved["preset"] == "read_only" and saved["label"] == "Original"
    assert "applications:write" not in saved["scopes"]
    await (
        db.commit()
    )  # Release the fixture session before independent API-key authentication.
    authorization = client.headers.pop("Authorization")
    try:
        write = await client.post(
            "/api/applications",
            headers={"X-API-Key": first["api_key"]},
            json={
                "company": "Acme",
                "job_title": "Forbidden",
                "status_id": workspace[2][0].id,
            },
        )
        assert write.status_code == 403
    finally:
        client.headers["Authorization"] = authorization
    assert (
        await client.patch(
            path, json={"label": "Reviewed", "expected_revision": saved["revision"]}
        )
    ).status_code == 200
    assert (
        await client.patch(
            path, json={"label": "Lost label", "expected_revision": saved["revision"]}
        )
    ).status_code == 409
    assert (await client.delete(path)).status_code == 204
    assert (
        await client.patch(
            path,
            json={"preset": "full_access", "expected_revision": saved["revision"] + 1},
        )
    ).status_code == 409


@pytest.mark.parametrize("kind", ["applications", "job-leads"])
async def test_stale_record_delete_keeps_newer_saved_data(client, workspace, kind):
    if kind == "applications":
        path = f"/api/applications/{workspace[4]}"
        field, revision, header = (
            "job_title",
            "evidence_revision",
            "Expected-Evidence-Revision",
        )
    else:
        created = (
            await client.post("/api/job-leads", json={"title": "Original"})
        ).json()
        path = "/api/job-leads/" + created["id"]
        field, revision, header = "title", "revision", "Expected-Revision"
    first = (await client.get(path)).json()
    changed = await client.patch(
        path, json={field: "Revised", "expected_revision": first[revision]}
    )
    assert changed.status_code == 200
    stale = await client.delete(path, headers={header: str(first[revision])})
    assert stale.status_code == 409
    saved = (await client.get(path)).json()
    assert saved[field] == "Revised"
    assert (
        await client.delete(path, headers={header: str(saved[revision])})
    ).status_code == 204
