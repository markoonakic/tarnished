"""Regression checks for the first round of release QA."""

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace

from app.core.database import get_db
from app.main import app


async def make_round(client, workspace):
    _, _, _, types, app_id = workspace
    response = await client.post(
        f"/api/applications/{app_id}/rounds", json={"round_type_id": types[0].id}
    )
    assert response.status_code == 201
    return response.json()


async def test_round_form_detects_transcript_changes_before_saving_metadata(
    client, workspace
):
    row = await make_round(client, workspace)
    path = f"/api/rounds/{row['id']}"
    assert (
        await client.put(
            path + "/transcript",
            json={"text": "Newer transcript"},
            headers={"Expected-Transcript-Generation": "0"},
        )
    ).status_code == 200
    response = await client.patch(
        path,
        json={
            "expected_revision": row["revision"],
            "expected_transcript_generation": 0,
            "notes_summary": "Stale draft",
        },
    )
    assert response.status_code == 409
    saved = (await client.get(path + "/transcript")).json()
    assert saved["transcript"]["segments"][0]["text"] == "Newer transcript"
    rounds = (await client.get(f"/api/applications/{workspace[4]}")).json()["rounds"]
    assert rounds[0]["notes_summary"] is None


@pytest.mark.parametrize("change", ["notes", "transcript", "media"])
async def test_round_delete_rejects_stale_snapshot(client, db, workspace, change):
    row = await make_round(client, workspace)
    path = f"/api/rounds/{row['id']}"
    if change == "notes":
        assert (
            await client.patch(
                path, json={"notes_summary": "New notes", "expected_revision": 0}
            )
        ).status_code == 200
    elif change == "transcript":
        assert (
            await client.put(
                path + "/transcript",
                json={"text": "New transcript"},
                headers={"Expected-Transcript-Generation": "0"},
            )
        ).status_code == 200
    else:
        from app.models import Round

        record = await db.get(Round, row["id"])
        record.media_generation += 1
        await db.commit()
    response = await client.delete(
        path,
        params={"expected_revision": 0},
        headers={
            "Expected-Transcript-Generation": "0",
            "Expected-Media-Generation": "0",
        },
    )
    assert response.status_code == 409
    assert (await client.get(path + "/transcript")).status_code == 200


async def test_round_retry_with_lost_response_returns_same_round(client, workspace):
    _, _, _, types, app_id = workspace
    key = str(uuid4())
    path = f"/api/applications/{app_id}/rounds"
    data = {"round_type_id": types[0].id, "notes_summary": "One round"}
    first = await client.post(path, json=data, headers={"Idempotency-Key": key})
    retry = await client.post(path, json=data, headers={"Idempotency-Key": key})
    assert first.status_code == retry.status_code == 201
    assert first.json()["id"] == retry.json()["id"] == key
    assert len((await client.get(f"/api/applications/{app_id}")).json()["rounds"]) == 1


@pytest.mark.parametrize("suffix", ["exe", "sh", "zip"])
async def test_transcript_rejects_unsupported_extension_even_for_plain_text(
    client, workspace, suffix
):
    row = await make_round(client, workspace)
    path = f"/api/rounds/{row['id']}/transcript"
    response = await client.post(
        path,
        files={"file": (f"wrong.{suffix}", b"Plain text")},
        headers={"Expected-Transcript-Generation": "0"},
    )
    assert response.status_code == 422
    assert (await client.get(path)).json()["generation"] == 0
    assert (await client.get(path)).json()["attachment_only"] is False


@pytest.mark.parametrize("kind", ["statuses", "round-types"])
async def test_settings_reject_stale_updates_and_keep_first_save(
    client, workspace, kind
):
    path = "/api/" + kind
    first = (await client.post(path, json={"name": "Initial"})).json()
    expected = {"expected_name": first["name"]}
    if kind == "statuses":
        expected.update(
            expected_color=first["color"], expected_meaning=first["meaning"]
        )
    assert (
        await client.patch(
            path + "/" + first["id"], json={**expected, "name": "First save"}
        )
    ).status_code == 200
    stale = await client.patch(
        path + "/" + first["id"], json={**expected, "name": "Stale save"}
    )
    assert stale.status_code == 409
    current = next(
        item for item in (await client.get(path)).json() if item["id"] == first["id"]
    )
    assert current["name"] == "First save"


@pytest.mark.parametrize("kind", ["statuses", "round-types"])
async def test_parallel_settings_create_never_returns_server_error(
    client, db_engine, workspace, kind
):
    factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def separate_sessions():
        async with factory() as session:
            yield session

    original = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = separate_sessions
    try:
        responses = await asyncio.gather(
            *[
                client.post("/api/" + kind, json={"name": "Parallel create"})
                for _ in range(2)
            ]
        )
        assert sorted(response.status_code for response in responses) == [201, 409]
        rows = (await client.get("/api/" + kind)).json()
        assert sum(row["name"] == "Parallel create" for row in rows) == 1
    finally:
        app.dependency_overrides[get_db] = original


async def test_contact_list_includes_saved_company_name(client, workspace):
    company = (
        await client.post("/api/companies", json={"name": "Linked company"})
    ).json()
    contact = (
        await client.post(
            "/api/contacts",
            json={"name": "Linked contact", "company_id": company["id"]},
        )
    ).json()
    row = next(
        item
        for item in (await client.get("/api/contacts")).json()["items"]
        if item["id"] == contact["id"]
    )
    assert row["company_id"] == company["id"]
    assert row["company_name"] == "Linked company"
