"""Editable transcript parser/router/CAS/transfer contracts on migrated SQLite and PG."""

import asyncio
from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace

from app.core.security import create_access_token
from app.models import Round
from app.schemas.transcript import MAX_TRANSCRIPT_BYTES
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService
from app.services.transcripts import owned_round, parse_transcript, publish_transcript

SRT = b"1\n00:00:01,000 --> 00:00:03,000\nA literal <script>bad()</script>\n\n2\n00:00:02,500 --> 00:00:04,000\nOverlapping speech\n"
VTT = b"WEBVTT\n\nfirst\n00:01.000 --> 00:03.000 align:start\n<v Speaker A>Hello there</v>\n\n00:03.000 --> 00:04.000\nUnknown speaker\n"


@pytest.mark.parametrize(
    "format,content",
    [("txt", b"First line\n\nSecond line"), ("srt", SRT), ("vtt", VTT)],
)
def test_parse_transcript_truthful_literal_source(format, content):
    result = parse_transcript(content, format, "upload")
    assert len(result.segments) == 2
    assert result.coverage == "provided_text"
    assert all(s.role == "unknown" for s in result.segments)
    if format == "txt":
        assert all(s.start is None and s.speaker is None for s in result.segments)
    else:
        assert result.segments[0].start == 1
    if format == "vtt":
        assert result.segments[0].speaker == "Speaker A"
        assert result.segments[0].text == "Hello there"
        assert result.segments[1].speaker is None
    if format == "srt":
        assert "<script>" in result.segments[0].text


@pytest.mark.parametrize(
    "format,content",
    [
        ("txt", b""),
        ("txt", b"\xff"),
        ("txt", b"private\x00text"),
        ("txt", b"a" * (MAX_TRANSCRIPT_BYTES + 1)),
        ("txt", b"a\n" * 10001),
        ("txt", b"x" * 64001),
        ("srt", b"1\n00:00:03,000 --> 00:00:01,000\nBad"),
        ("srt", b"1\n00:61:00,000 --> 00:62:00,000\nBad"),
        ("srt", b"1\n02:00:00,000 --> 02:00:01,000\nToo long"),
        ("vtt", b""),
        ("srt", b""),
        ("vtt", b"no header"),
        ("vtt", b"WEBVTT\n\nSTYLE\n::cue { color:red }"),
        (
            "srt",
            b"1\n00:00:02,000 --> 00:00:03,000\nFirst\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond",
        ),
    ],
)
def test_parse_transcript_rejects_invalid_without_partial_output(format, content):
    with pytest.raises((ValueError, UnicodeError)):
        parse_transcript(content, format, "upload")


@pytest.mark.parametrize("format", ["srt", "vtt"])
@pytest.mark.parametrize("timestamp", ["start", "end"])
def test_parse_transcript_rejects_oversized_hours(format, timestamp):
    content = oversized_hours_subtitle(format, timestamp)
    with pytest.raises(ValueError):
        parse_transcript(content, format, "upload")


def oversized_hours_subtitle(format, timestamp):
    start = "9" * 310 + ":00:00.000" if timestamp == "start" else "00:00:00.000"
    end = "9" * 310 + ":00:01.000" if timestamp == "end" else "00:00:01.000"
    cue = f"{start} --> {end}\nPRIVATE-OVERSIZED-HOURS-CANARY"
    return (
        "WEBVTT\n\n" + cue if format == "vtt" else "1\n" + cue.replace(".", ",")
    ).encode()


@pytest.fixture
async def transcript_round(client, workspace):
    _, _, _, types, app_id = workspace
    response = await client.post(
        f"/api/applications/{app_id}/rounds", json={"round_type_id": types[0].id}
    )
    assert response.status_code == 201
    return response.json()["id"]


def expected(generation):
    return {"Expected-Transcript-Generation": str(generation)}


@pytest.mark.parametrize("format", ["srt", "vtt"])
@pytest.mark.parametrize("method", ["put", "post"])
async def test_transcript_oversized_hours_validation_retains_content(
    client, db, transcript_round, format, method
):
    path = f"/api/rounds/{transcript_round}/transcript"
    response = await client.post(
        path,
        files={"file": ("retained.txt", b"Retained transcript")},
        headers=expected(0),
    )
    assert response.status_code == 200
    retained_round = response.json()
    original = (await client.get(path)).json()
    assert original["generation"] == 1
    for timestamp in ("start", "end"):
        content = oversized_hours_subtitle(format, timestamp)
        if method == "put":
            response = await client.put(
                path,
                json={"text": content.decode(), "format": format},
                headers=expected(1),
            )
        else:
            response = await client.post(
                path, files={"file": (f"bad.{format}", content)}, headers=expected(1)
            )
        assert response.status_code == 422
        assert response.json() == {
            "detail": "Invalid transcript. Use nonempty UTF-8 TXT/SRT/VTT within the documented limits"
        }
        assert (await client.get(path)).json() == original
        retained = await client.get(f"/api/files/rounds/{transcript_round}/transcript")
        assert retained.status_code == 200
        assert retained.content == b"Retained transcript"
        current_round = await db.get(Round, transcript_round)
        assert current_round is not None
        await db.refresh(current_round)
        for field in (
            "transcript_path",
            "transcript_original_filename",
            "transcript_generation",
        ):
            assert getattr(current_round, field) == retained_round[field]


async def test_transcript_full_router_lifecycle(
    client, db, workspace, transcript_round
):
    path = f"/api/rounds/{transcript_round}/transcript"
    assert (await client.get(path)).json() == {
        "generation": 0,
        "transcript": None,
        "attachment_only": False,
    }
    response = await client.put(
        path, json={"text": "My first answer\nOther speaker"}, headers=expected(0)
    )
    assert response.status_code == 200, response.text
    first = response.json()["transcript"]
    assert first["provenance"] == "paste"
    edit = deepcopy(first["segments"])
    edit[0].update(text="Corrected exact evidence", speaker="Me", role="candidate")
    response = await client.patch(path, json={"segments": edit}, headers=expected(1))
    assert response.status_code == 200, response.text
    current = response.json()["transcript"]
    assert current["id"] == first["id"] and current["revision"] == 2
    assert current["segments"] == edit
    assert (
        await client.patch(path, json={"segments": edit}, headers=expected(1))
    ).status_code == 409
    assert (await client.delete(path)).status_code == 409
    assert (
        await client.post(path, files={"file": ("new.txt", b"stale caller")})
    ).status_code == 409
    assert (
        await client.post(
            path, headers=expected(2), files={"file": ("new.pdf", b"%PDF attachment")}
        )
    ).status_code == 409
    data = (await client.get(f"/api/applications/{workspace[4]}")).json()
    assert "Corrected exact evidence" not in str(data)
    assert data["rounds"][0]["has_current_transcript"] is True
    response = await client.post(
        path, files={"file": ("provided.vtt", VTT)}, headers=expected(2)
    )
    assert response.status_code == 200, response.text
    assert response.json()["round_type"] and "current_transcript" not in response.json()
    replacement = (await client.get(path)).json()
    assert replacement["transcript"]["id"] != first["id"]
    assert replacement["generation"] == 3
    altered = deepcopy(replacement["transcript"]["segments"])
    altered[0]["start"] = 0.5
    assert (
        await client.patch(path, json={"segments": altered}, headers=expected(3))
    ).status_code == 422
    assert (await client.delete(path, headers=expected(3))).status_code == 204
    assert (await client.delete(path, headers=expected(4))).status_code == 204
    assert (
        await client.put(path, json={"text": "stale resurrection"}, headers=expected(3))
    ).status_code == 409
    assert (await client.get(path)).json()["generation"] == 5
    await db.refresh(await db.get(Round, transcript_round))
    round = await db.get(Round, transcript_round)
    assert round.current_transcript is None and round.transcript_path is None


async def test_upload_legacy_response_validation_and_isolation(
    client, db, workspace, transcript_round, monkeypatch, tmp_path
):
    from app.api import rounds

    monkeypatch.setattr(rounds.settings, "upload_dir", str(tmp_path))
    path = f"/api/rounds/{transcript_round}/transcript"
    response = await client.post(
        path, files={"file": ("source.txt", b"Original source")}
    )
    assert response.status_code == 200, response.text
    assert response.json()["transcript_original_filename"] == "source.txt"
    original = (await client.get(path)).json()
    for content in [b"bad\x00", b"x" * (MAX_TRANSCRIPT_BYTES + 1), b"\xff"]:
        response = await client.post(
            path, headers=expected(1), files={"file": ("source.txt", content)}
        )
        assert response.status_code in (413, 422)
        assert (await client.get(path)).json() == original
    other = workspace[1]
    client.headers["Authorization"] = "Bearer " + create_access_token(
        {"sub": other.id, "session_version": other.session_version}
    )
    assert (await client.get(path)).status_code == 404
    assert (
        await client.put(path, json={"text": "foreign"}, headers=expected(1))
    ).status_code == 404
    assert (await client.delete(path, headers=expected(1))).status_code == 404


async def test_transcript_scope_and_revocation(client, db, workspace, transcript_round):
    path = f"/api/rounds/{transcript_round}/transcript"
    assert (
        await client.put(path, json={"text": "private source"}, headers=expected(0))
    ).status_code == 200
    jwt = client.headers.pop("Authorization")
    for scopes in [
        ["rounds:read"],
        ["files:read"],
        ["analytics:read"],
        ["files:read", "rounds:read"],
    ]:
        key = await client.post(
            "/api/settings/api-keys",
            headers={"Authorization": jwt},
            json={"label": "synthetic", "preset": "custom", "scopes": scopes},
        )
        assert key.status_code == 201, key.text
        client.headers["X-API-Key"] = key.json()["api_key"]
        result = await client.get(path)
        assert result.status_code == (200 if len(scopes) == 2 else 403), result.text
        assert (
            await client.put(path, json={"text": "unapproved"}, headers=expected(1))
        ).status_code == 403
        revoked = await client.delete(
            f"/api/settings/api-keys/{key.json()['id']}", headers={"Authorization": jwt}
        )
        assert revoked.status_code == 204
        assert (await client.get(path)).status_code == 401
        client.headers.pop("X-API-Key")


@pytest.mark.parametrize("legacy", [False, True])
async def test_transcript_atomic_two_session_publish_and_late_delete(
    db_engine, client, workspace, transcript_round, legacy
):
    owner_id = workspace[0].id
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    first = parse_transcript(b"winner", "txt", "paste").model_dump()
    second = parse_transcript(b"loser", "txt", "paste").model_dump()

    ready = asyncio.Event()
    readers = []

    async def publish(value):
        async with sessions() as session:
            observed = await owned_round(session, transcript_round, owner_id)
            readers.append(observed.transcript_generation)
            if len(readers) == 2:
                ready.set()
            await asyncio.wait_for(ready.wait(), timeout=5)
            assert observed.transcript_generation == 0
            try:
                await publish_transcript(
                    session,
                    transcript_round,
                    owner_id,
                    0,
                    {"current_transcript": value},
                    legacy=legacy,
                )
                return "ok"
            except HTTPException as exc:
                return exc.status_code

    outcomes = await asyncio.gather(publish(first), publish(second))
    assert sorted(map(str, outcomes)) == ["409", "ok"]
    async with sessions() as session:
        before = await session.get(Round, transcript_round)
        assert before is not None
        assert before.current_transcript in (first, second)
        await publish_transcript(
            session, transcript_round, owner_id, 1, {"current_transcript": None}
        )
    async with sessions() as session:
        with pytest.raises(HTTPException) as exc:
            await publish_transcript(
                session,
                transcript_round,
                owner_id,
                0,
                {"current_transcript": second},
                legacy=legacy,
            )
        assert exc.value.status_code == 409
        current = await session.get(Round, transcript_round)
        assert current is not None
        assert current.current_transcript is None and current.transcript_generation == 2


async def test_transcript_transfer_remaps_identity_and_cascades(
    client, db, workspace, transcript_round
):
    owner, other, _, _, app_id = workspace
    path = f"/api/rounds/{transcript_round}/transcript"
    original = (
        await client.put(path, json={"text": "portable source"}, headers=expected(0))
    ).json()["transcript"]
    service = ExportService(default_registry)
    exported = await db.run_sync(
        lambda session: service.export_user_data(owner.id, session)
    )
    transferred = [
        row for row in exported["models"]["Round"] if row["id"] == transcript_round
    ][0]
    assert transferred["current_transcript"] == original
    importer = ImportService(default_registry, IDMapper())
    await db.run_sync(
        lambda session: importer.import_user_data(exported, other.id, session)
    )
    await db.commit()
    mapped = importer.id_mapper.get("Round", transcript_round)
    restored = await db.get(Round, mapped)
    assert restored.current_transcript["id"] != original["id"]
    assert (
        restored.current_transcript["segments"][0]["id"]
        != original["segments"][0]["id"]
    )
    assert restored.current_transcript["segments"][0]["text"] == "portable source"
    assert restored.transcript_generation == 1
    tampered = deepcopy(exported)
    tampered["models"]["Round"][0]["current_transcript"]["secret_endpoint"] = (
        "https://foreign"
    )
    valid, message = importer.validate_export_data(tampered)
    assert valid is False
    assert message is not None
    assert "https://foreign" not in message
    assert (await client.delete(f"/api/applications/{app_id}")).status_code == 204
    assert await db.scalar(select(Round.id).where(Round.id == transcript_round)) is None
    assert await db.get(Round, mapped) is not None


def test_mixed_vtt_voices_remain_unattributed():
    result = parse_transcript(
        b"WEBVTT\n\n00:01.000 --> 00:03.000\n<v A>one</v><v B>two</v>", "vtt", "upload"
    )
    assert result.segments[0].speaker is None
    assert result.segments[0].role == "unknown"
    assert "<v B>two</v>" in result.segments[0].text


async def test_streamed_body_limit_before_parsing(client, workspace, transcript_round):
    async def chunks():
        for _ in range(17):
            yield b"x" * 1_000_000

    result = await client.put(
        f"/api/rounds/{transcript_round}/transcript",
        content=chunks(),
        headers={**expected(0), "Content-Type": "application/json"},
    )
    assert result.status_code == 413
    assert (await client.get(f"/api/rounds/{transcript_round}/transcript")).json()[
        "generation"
    ] == 0


async def test_legacy_attachment_absence_guard_and_late_source_deletion(
    db_engine, client, workspace, transcript_round
):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    source = parse_transcript(
        b"cannot silently replace this", "txt", "paste"
    ).model_dump()
    async with sessions() as session:
        await publish_transcript(
            session,
            transcript_round,
            workspace[0].id,
            0,
            {"current_transcript": source},
        )
    async with sessions() as session:
        # Even a correctly guessed generation cannot bypass legacy absence guard.
        with pytest.raises(HTTPException) as exc:
            await publish_transcript(
                session,
                transcript_round,
                workspace[0].id,
                1,
                {"current_transcript": None},
                legacy=True,
            )
        assert exc.value.status_code == 409
    assert (await client.delete(f"/api/rounds/{transcript_round}")).status_code == 204
    async with sessions() as session:
        with pytest.raises(HTTPException) as exc:
            await publish_transcript(
                session,
                transcript_round,
                workspace[0].id,
                1,
                {"current_transcript": source},
            )
        assert exc.value.status_code == 409
        assert await session.get(Round, transcript_round) is None


@pytest.mark.parametrize(
    "filename,content",
    [
        ("source.txt", b"<html><script>literal source only</script></html>"),
        ("source.vtt", VTT),
    ],
)
async def test_uploaded_transcript_zip_original_and_corrections_roundtrip(
    client, db, workspace, transcript_round, monkeypatch, tmp_path, filename, content
):
    import json
    from pathlib import Path

    from app.api import rounds
    from app.api.utils.zip_utils import create_zip_export_file
    from app.services import import_execution
    from app.services.import_execution import extract_files_from_new_format

    uploads = tmp_path / "uploads"
    monkeypatch.setattr(rounds.settings, "upload_dir", str(uploads))
    path = f"/api/rounds/{transcript_round}/transcript"
    response = await client.post(
        path, files={"file": (filename, content)}, headers=expected(0)
    )
    assert response.status_code == 200
    raw_path = response.json()["transcript_path"]
    result = await client.get(f"/api/files/rounds/{transcript_round}/transcript")
    assert result.status_code == 200
    assert result.content == content
    assert result.headers["content-type"].startswith("text/plain")
    assert result.headers["x-content-type-options"] == "nosniff"
    current = (await client.get(path)).json()["transcript"]
    current["segments"][0].update(
        text="Portable correction", role="candidate", speaker="Me"
    )
    assert (
        await client.patch(
            path, json={"segments": current["segments"]}, headers=expected(1)
        )
    ).status_code == 200
    exported = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[0].id, session
        )
    )
    zip_path = await create_zip_export_file(
        json.dumps(exported), workspace[0].id, str(uploads)
    )
    try:
        restored_files = tmp_path / "restored"
        monkeypatch.setattr(import_execution, "UPLOAD_DIR", str(restored_files))
        mapping = extract_files_from_new_format(zip_path, workspace[1].id)
        assert (restored_files / Path(mapping[raw_path]).name).read_bytes() == content
        importer = ImportService(default_registry, IDMapper())
        await db.run_sync(
            lambda session: importer.import_user_data(
                exported, workspace[1].id, session, file_mapping=mapping
            )
        )
        await db.commit()
        restored = await db.get(
            Round, importer.id_mapper.get("Round", transcript_round)
        )
        assert (
            restored.current_transcript["segments"][0]["text"] == "Portable correction"
        )
        assert restored.current_transcript["segments"][0]["role"] == "candidate"
        assert restored.transcript_path == mapping[raw_path]
    finally:
        Path(zip_path).unlink()


async def test_transcript_validation_does_not_echo_private_or_invalid_unicode(
    client, workspace, transcript_round
):
    path = f"/api/rounds/{transcript_round}/transcript"
    response = await client.put(
        path,
        content=b'{"text":"\\ud800"}',
        headers={**expected(0), "Content-Type": "application/json"},
    )
    assert response.status_code == 422
    response = await client.patch(
        path,
        json={
            "segments": [
                {"id": "bad", "text": "PRIVATE-VALIDATION-CANARY", "role": "invented"}
            ]
        },
        headers=expected(0),
    )
    assert response.status_code == 422
    assert "PRIVATE-VALIDATION-CANARY" not in response.text


def test_transcript_exact_text_count_and_time_boundaries():
    content = (b"a" * 999 + b"\n") * 2000
    assert len(content) == MAX_TRANSCRIPT_BYTES
    assert len(parse_transcript(content, "txt", "upload").segments) == 2000
    assert len(parse_transcript(b"a\n" * 10000, "txt", "upload").segments) == 10000
    result = parse_transcript(
        b"1\n01:59:59,000 --> 02:00:00,000\nLast second", "srt", "upload"
    )
    assert result.segments[0].end == 7200
