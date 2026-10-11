"""Recording source deletion must not discard another tab's transcript corrections."""

from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_media_intake import recording_round as recording_round
from tests.test_media_intake import upload, wav_bytes

from app.models import Round, RoundMedia
from app.services.transcripts import parse_transcript


@pytest.fixture
async def source_recording(client, db, recording_round):
    uploaded = await upload(client, recording_round)
    assert uploaded.status_code == 200
    media = uploaded.json()["media"][0]
    transcript = parse_transcript(b"Original words", "txt", "paste").model_dump()
    transcript.update(
        provenance="media",
        format="json",
        source_media_id=media["id"],
        source_hash=media["sha256"],
        coverage="complete_audio",
        provider="synthetic",
        model="synthetic",
        config_revision=str(uuid4()),
        audio_coverage=[
            {
                "track": 0,
                "channel": 0,
                "index": 0,
                "start": 0,
                "end": 1,
                "sha256": media["sha256"],
            }
        ],
    )
    await db.execute(
        update(Round)
        .where(Round.id == recording_round)
        .values(
            current_transcript=transcript,
            transcript_generation=1,
            transcript_summary="Keep summary",
            notes_summary="Keep notes",
        )
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return recording_round, media, transcript


async def correct(client, round_id, transcript):
    segments = deepcopy(transcript["segments"])
    segments[0]["text"] = "Newer important correction"
    response = await client.patch(
        f"/api/rounds/{round_id}/transcript",
        headers={"Expected-Transcript-Generation": "1"},
        json={"segments": segments},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("operation", ["delete", "replace"])
@pytest.mark.parametrize("expected", [None, 1, 2])
async def test_source_recording_requires_reviewed_transcript_generation(
    client, db, source_recording, operation, expected
):
    round_id, media, transcript = source_recording
    newer = await correct(client, round_id, transcript)
    headers = {"Expected-Media-Generation": "1"}
    if expected is not None:
        headers["Expected-Transcript-Generation"] = str(expected)
    if operation == "replace":
        headers["Replace-Media-Id"] = media["id"]
        response = await client.post(
            f"/api/rounds/{round_id}/media",
            headers=headers,
            files={"file": ("replacement.wav", wav_bytes(2), "audio/wav")},
        )
    else:
        response = await client.delete(f"/api/media/{media['id']}", headers=headers)
    success = 200 if operation == "replace" else 204
    assert response.status_code == (success if expected == 2 else 409), response.text
    # A fresh read confirms that neither the source nor its corrections changed
    # on conflict, including the media-generation claim made in the transaction.
    await db.rollback()
    row = await db.get(Round, round_id, populate_existing=True)
    state = (await client.get(f"/api/rounds/{round_id}/transcript")).json()
    if expected == 2:
        assert state["transcript"] is None and state["generation"] == 3
        assert await db.get(RoundMedia, media["id"], populate_existing=True) is None
        assert row.media_generation == 2
    else:
        assert state == newer
        assert row.media_generation == 1 and row.transcript_summary == "Keep summary"
        download = await client.get(f"/api/files/media/{media['id']}")
        assert download.status_code == 200 and download.content == wav_bytes()
    assert row.notes_summary == "Keep notes"


async def test_replacement_rechecks_transcript_after_recording_validation(
    client, db, db_engine, source_recording, monkeypatch
):
    from app.api import rounds

    round_id, media, transcript = source_recording
    validate = rounds.validate_recording
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def validate_after_correction(path):
        metadata = await validate(path)
        newer = deepcopy(transcript)
        newer["segments"][0]["text"] = "Correction saved during validation"
        newer["revision"] += 1
        async with sessions() as session:
            await session.execute(
                update(Round)
                .where(Round.id == round_id)
                .values(current_transcript=newer, transcript_generation=2)
            )
            await session.commit()
        return metadata

    monkeypatch.setattr(rounds, "validate_recording", validate_after_correction)
    response = await client.post(
        f"/api/rounds/{round_id}/media",
        headers={
            "Expected-Media-Generation": "1",
            "Expected-Transcript-Generation": "1",
            "Replace-Media-Id": media["id"],
        },
        files={"file": ("replacement.wav", wav_bytes(2), "audio/wav")},
    )
    assert response.status_code == 409
    await db.rollback()
    row = await db.get(Round, round_id, populate_existing=True)
    assert row.media_generation == 1 and row.transcript_generation == 2
    assert (
        row.current_transcript["segments"][0]["text"]
        == "Correction saved during validation"
    )
    assert await db.get(RoundMedia, media["id"], populate_existing=True) is not None


async def test_source_replacement_lost_response_reuses_saved_id(
    client, db, source_recording
):
    round_id, media, transcript = source_recording
    await correct(client, round_id, transcript)
    headers = {
        "Expected-Media-Generation": "1",
        "Expected-Transcript-Generation": "2",
        "Replace-Media-Id": media["id"],
        "Idempotency-Key": str(uuid4()),
    }
    responses = []
    for _ in range(2):
        response = await client.post(
            f"/api/rounds/{round_id}/media",
            headers=headers,
            files={"file": ("replacement.wav", wav_bytes(2), "audio/wav")},
        )
        assert response.status_code == 200, response.text
        responses.append(response.json())
    assert responses[0]["media"] == responses[1]["media"]
    assert responses[1]["media_generation"] == 2
    assert responses[1]["transcript_generation"] == 3
    assert (
        len(
            (
                await db.scalars(
                    select(RoundMedia).where(RoundMedia.round_id == round_id)
                )
            ).all()
        )
        == 1
    )


async def test_unrelated_recording_removal_preserves_source_corrections(
    client, db, source_recording
):
    round_id, media, transcript = source_recording
    added = await upload(client, round_id, wav_bytes(2), generation=1)
    assert added.status_code == 200
    unrelated = next(m for m in added.json()["media"] if m["id"] != media["id"])
    newer = await correct(client, round_id, transcript)
    deleted = await client.delete(
        f"/api/media/{unrelated['id']}",
        headers={
            "Expected-Media-Generation": "2",
            "Expected-Transcript-Generation": "1",
        },
    )
    assert deleted.status_code == 204
    assert (await client.get(f"/api/rounds/{round_id}/transcript")).json() == newer
    assert await db.get(RoundMedia, media["id"], populate_existing=True) is not None
