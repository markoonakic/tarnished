"""Regression checks for the second release QA pass."""

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_media_intake import wav_bytes
from tests.test_qa_round1 import make_round

from app.core.database import get_db
from app.main import app
from app.models import Application, JobLead, RoundMedia
from app.models.workspace import Company, Contact, Note


@pytest.mark.parametrize(
    "kind", ["applications", "job-leads", "companies", "contacts", "notes"]
)
async def test_create_recovery_has_one_record_and_rejects_changed_retry(
    client, db_engine, workspace, kind
):
    owner, _, statuses, _, app_id = workspace
    model, values, field = {
        "applications": (
            Application,
            {"company": "Acme", "job_title": "One intent", "status_id": statuses[0].id},
            "job_title",
        ),
        "job-leads": (
            JobLead,
            {"title": "One intent", "url": "https://example.test/unique"},
            "title",
        ),
        "companies": (Company, {"name": "One intent"}, "name"),
        "contacts": (Contact, {"name": "One intent"}, "name"),
        "notes": (Note, {"body": "One intent", "application_id": app_id}, "body"),
    }[kind]
    factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def sessions():
        async with factory() as session:
            yield session

    original = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = sessions
    key = str(uuid4())
    try:
        responses = await asyncio.gather(
            *[
                client.post(
                    "/api/" + kind, json=values, headers={"Idempotency-Key": key}
                )
                for _ in range(2)
            ]
        )
        assert [r.status_code for r in responses] == [201, 201]
        assert {r.json()["id"] for r in responses} == {key}
        retry = await client.post(
            "/api/" + kind, json=values, headers={"Idempotency-Key": key}
        )
        assert retry.status_code == 201 and retry.json()["id"] == key
        changed = await client.post(
            "/api/" + kind,
            json={**values, field: "Changed draft"},
            headers={"Idempotency-Key": key},
        )
        assert changed.status_code == 409
        assert changed.json()["detail"]["code"] == "create_content_changed"
        async with factory() as session:
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(model)
                    .where(model.id == key, model.user_id == owner.id)
                )
                == 1
            )
            assert getattr(await session.get(model, key), field) == "One intent"
    finally:
        app.dependency_overrides[get_db] = original


async def test_round_retry_rejects_changed_notes_and_duration(client, workspace):
    data = {
        "round_type_id": workspace[3][0].id,
        "notes_summary": "First",
        "duration_minutes": 25,
    }
    headers = {"Idempotency-Key": str(uuid4())}
    path = f"/api/applications/{workspace[4]}/rounds"
    first = await client.post(path, json=data, headers=headers)
    assert first.status_code == 201
    retry = await client.post(
        path,
        json={**data, "notes_summary": "Corrected", "duration_minutes": 75},
        headers=headers,
    )
    assert retry.status_code == 409
    rows = (await client.get(f"/api/applications/{workspace[4]}")).json()["rounds"]
    assert len(rows) == 1 and rows[0]["duration_minutes"] == 25


async def test_recording_lost_response_recovers_before_stale_generation_check(
    client, db, workspace
):
    row = await make_round(client, workspace)
    path = f"/api/rounds/{row['id']}/media"
    headers = {"Idempotency-Key": str(uuid4()), "Expected-Media-Generation": "0"}
    first = await client.post(
        path, files={"file": ("tone.wav", wav_bytes())}, headers=headers
    )
    assert first.status_code == 200
    retry = await client.post(
        path, files={"file": ("tone.wav", wav_bytes())}, headers=headers
    )
    assert retry.status_code == 200
    assert retry.json()["media_generation"] == first.json()["media_generation"] == 1
    assert len(retry.json()["media"]) == 1
    assert (
        await db.scalar(
            select(func.count())
            .select_from(RoundMedia)
            .where(RoundMedia.round_id == row["id"])
        )
        == 1
    )


@pytest.mark.parametrize("kind", ["statuses", "round-types"])
async def test_settings_delete_checks_original_displayed_values(
    client, workspace, kind
):
    path = "/api/" + kind
    first = (await client.post(path, json={"name": "Original"})).json()
    expected = {"expected_name": first["name"]}
    if kind == "statuses":
        expected.update(
            expected_color=first["color"], expected_meaning=first["meaning"]
        )
    assert (
        await client.patch(path + "/" + first["id"], json={"name": "Revised"})
    ).status_code == 200
    stale = await client.delete(path + "/" + first["id"], params=expected)
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "settings_changed"
    saved = next(
        item for item in (await client.get(path)).json() if item["id"] == first["id"]
    )
    assert saved["name"] == "Revised"
    expected["expected_name"] = saved["name"]
    assert (
        await client.delete(path + "/" + first["id"], params=expected)
    ).status_code == 204


@pytest.mark.parametrize("kind", ["cv", "cover-letter"])
async def test_document_upload_and_delete_reject_stale_evidence(
    client, workspace, kind
):
    path = f"/api/applications/{workspace[4]}/{kind}"
    headers = {"Expected-Evidence-Revision": "0"}
    first = await client.post(
        path, files={"file": ("first.txt", b"First CV")}, headers=headers
    )
    assert first.status_code == 200
    assert (
        await client.post(
            path, files={"file": ("stale.txt", b"Stale CV")}, headers=headers
        )
    ).status_code == 409
    assert (await client.delete(path, headers=headers)).status_code == 409
    saved = (await client.get(f"/api/applications/{workspace[4]}")).json()
    prefix = kind.replace("-", "_")
    assert saved[prefix + "_path"] == first.json()[prefix + "_path"]
    assert saved["evidence_revision"] == 1


@pytest.mark.parametrize("suffix", ["pdf", "docx"])
async def test_attachment_replacement_has_a_format_error_not_a_conflict(
    client, workspace, suffix
):
    row = await make_round(client, workspace)
    path = f"/api/rounds/{row['id']}/transcript"
    assert (
        await client.put(
            path,
            json={"text": "Keep this transcript"},
            headers={"Expected-Transcript-Generation": "0"},
        )
    ).status_code == 200
    response = await client.post(
        path,
        files={"file": ("replacement." + suffix, b"attachment")},
        headers={"Expected-Transcript-Generation": "1"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "transcript_attachment_replacement"
    assert (await client.get(path)).json()["transcript"]["segments"][0][
        "text"
    ] == "Keep this transcript"


@pytest.mark.parametrize(
    "path,key",
    [
        ("applications", "search"),
        ("applications/board", "search"),
        ("job-leads", "search"),
        ("companies", "query"),
        ("contacts", "query"),
    ],
)
async def test_search_boundary_is_validated_by_all_list_apis(
    client, workspace, path, key
):
    assert (
        await client.get("/api/" + path, params={key: "x" * 200})
    ).status_code == 200
    assert (
        await client.get("/api/" + path, params={key: "x" * 201})
    ).status_code == 422
