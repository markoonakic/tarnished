"""Transcription requests, recovery, audio coverage and local silence detection."""

import asyncio
import hashlib
import io
import json
import wave
from array import array
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace

from app.core.config import get_settings
from app.core.deps import AuthContext
from app.models import ProcessingJob, Round, RoundMedia, User
from app.schemas.ai_settings import AISettingsUpdate
from app.services.ai_settings import update_ai_settings
from app.services.speech_openai import SpeechResult
from app.services.transcription_executor import TranscriptionExecutor
from app.services.transcription_jobs import (
    checkpoint,
    guard_job,
    publish_result,
    start_job,
)


def audio_bytes(seconds=1):
    """An audible synthetic tone: a recording fixture, not dead air.

    Real dead air is deliberately handled in its own tests; the shared fixture
    must stay audible so existing dispatch/coverage tests exercise real dispatch.
    A 400 Hz square-like pattern keeps generation cheap for long fixtures.
    """
    cycle = array("h", [8000] * 20 + [-8000] * 20).tobytes()
    return _wav(cycle * (16000 * seconds // 40))


def silent_audio_bytes(seconds=1):
    """Genuine digital dead air, used only by the local silence-detection tests."""
    return _wav(b"\0\0" * 16000 * seconds)


def quiet_audio_bytes(seconds=1, amplitude=10):
    """Audible but very quiet audio, above the local dead-air threshold."""
    cycle = array("h", [amplitude] * 20 + [-amplitude] * 20).tobytes()
    return _wav(cycle * (16000 * seconds // 40))


def mixed_audio_bytes(silent_seconds=601, audible_seconds=0.5):
    """Long dead air followed by a short audible tail, so only the tail speaks."""
    quiet = array("h", [8000] * 20 + [-8000] * 20).tobytes()
    frames = b"\0\0" * int(16000 * (silent_seconds - audible_seconds))
    frames += quiet * int(16000 * audible_seconds // 40)
    return _wav(frames)


def _wav(frames):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(frames)
    return buffer.getvalue()


@asynccontextmanager
async def speech_fixture(status: int | list[int] = 200, hold=None, payload=None):
    calls = []
    tasks = set()

    async def handle(reader, writer):
        task = asyncio.current_task()
        tasks.add(task)
        try:
            headers = await reader.readuntil(b"\r\n\r\n")
            length = int(
                next(
                    line.split(b":", 1)[1]
                    for line in headers.split(b"\r\n")
                    if line.lower().startswith(b"content-length:")
                )
            )
            body = await reader.readexactly(length)
            calls.append((headers, body))
            if hold is not None:
                await hold.wait()
            response_body = json.dumps(
                payload
                if payload is not None
                else {
                    "text": "Synthetic contract passage",
                    "ignored_secret": "RAW-RESPONSE-CANARY",
                }
            ).encode()
            response_status = (
                status
                if isinstance(status, int)
                else status[min(len(calls) - 1, len(status) - 1)]
            )
            writer.write(
                f"HTTP/1.1 {response_status} Fixture\r\nContent-Type: application/json\r\nContent-Length: {len(response_body)}\r\nConnection: close\r\n\r\n".encode()
                + response_body
            )
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()
            tasks.discard(task)

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    try:
        yield f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}/v1", calls
    finally:
        server.close()
        await server.wait_closed()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


@pytest.fixture
async def recording(db, workspace, tmp_path, monkeypatch):
    owner, _, _, types, application_id = workspace
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    data = audio_bytes()
    path = tmp_path / "recording.wav"
    path.write_bytes(data)
    round = Round(application_id=application_id, round_type_id=types[0].id)
    db.add(round)
    await db.flush()
    media = RoundMedia(
        round_id=round.id,
        file_path="uploads/recording.wav",
        media_type="audio",
        validation="imported_unverified",
        sha256=hashlib.sha256(data).hexdigest(),
        byte_count=len(data),
        probed_duration_seconds=1.0,
    )
    db.add(media)
    await db.commit()
    return owner, round, media, path


async def admitted(db, recording, endpoint="http://127.0.0.1:9/v1"):
    owner, round, media, _ = recording
    state = await update_ai_settings(
        db,
        AISettingsUpdate(
            speech_enabled=True,
            speech_provider="openai",
            speech_model="whisper-1",
            speech_keyless=True,
            speech_endpoint=endpoint,
        ),
    )
    job = await start_job(
        db,
        AuthContext(owner, "jwt"),
        round.id,
        media.id,
        str(uuid4()),
        round.transcript_generation,
        state.speech.revision,
    )
    await db.commit()
    return job


async def claim(db, job):
    token = str(uuid4())
    await guard_job(db, job.id, None, ("queued",))
    job.state = "preparing"
    job.claim_id = token
    await db.commit()
    return token


async def test_actual_sdk_multipart_local_preparation_publication_and_editor(
    client, db, db_engine, recording, monkeypatch
):
    async with speech_fixture() as (endpoint, calls):
        # Ambient account headers/proxies/keys must not affect the checked route.
        monkeypatch.setenv("OPENAI_API_KEY", "AMBIENT-SECRET")
        monkeypatch.setenv("OPENAI_ORG_ID", "AMBIENT-ORG")
        monkeypatch.setenv("OPENAI_PROJECT_ID", "AMBIENT-PROJECT")
        monkeypatch.setenv("OPENAI_BASE_URL", "http://not-authorized.invalid")
        monkeypatch.setenv("HTTPS_PROXY", "http://not-authorized.invalid")
        job = await admitted(db, recording, endpoint)
        token = await claim(db, job)
        executor = TranscriptionExecutor(
            async_sessionmaker(db_engine, expire_on_commit=False)
        )
        executor.root.mkdir(parents=True)
        executor.accepting = True
        await executor.execute(job.id, token)
    await db.refresh(job)
    await db.refresh(recording[1])
    assert job.state == "complete" and not job.checkpoints and not job.uncertain
    assert recording[1].transcript_generation == 1
    headers, body = calls[0]
    assert len(calls) == 1 and headers.startswith(
        b"POST /v1/audio/transcriptions HTTP/1.1"
    )
    assert (
        b"multipart/form-data" in headers and b"audio.wav" in body and b"RIFF" in body
    )
    assert b"\r\n\r\nwhisper-1\r\n" in body and b"\r\n\r\nen\r\n" in body
    assert b"\r\n\r\nverbose_json\r\n" in body
    assert b'name="timestamp_granularities[]"' in body
    assert b"\r\n\r\nsegment\r\n" in body
    assert b"authorization:" not in headers.lower() and b"AMBIENT" not in headers + body
    assert b"openai-organization" not in headers.lower()
    current = (await client.get(f"/api/rounds/{recording[1].id}/transcript")).json()
    assert current["transcript"]["segments"][0]["text"] == "Synthetic contract passage"
    assert current["transcript"]["segments"][0]["start"] is None
    assert current["transcript"]["segments"][0]["role"] == "unknown"
    assert current["transcript"]["audio_coverage"][0]["end"] == 1
    summary = await client.get(f"/api/transcriptions/{job.id}")
    assert (
        summary.status_code == 200 and "Synthetic contract passage" not in summary.text
    )
    assert "RAW-RESPONSE-CANARY" not in str(recording[1].current_transcript)
    current["transcript"]["segments"][0]["text"] = "Human correction"
    saved = await client.patch(
        f"/api/rounds/{recording[1].id}/transcript",
        headers={"Expected-Transcript-Generation": "1"},
        json={"segments": current["transcript"]["segments"]},
    )
    assert saved.status_code == 200 and saved.json()["generation"] == 2
    deleted = await client.delete(f"/api/media/{recording[2].id}")
    assert deleted.status_code == 204
    assert (await client.get(f"/api/rounds/{recording[1].id}/transcript")).json()[
        "transcript"
    ] is None
    assert (await client.get(f"/api/transcriptions/{job.id}")).status_code == 404


async def dispatched(db, recording):
    job = await admitted(db, recording)
    token = await claim(db, job)
    chunk = {
        "track": 0,
        "channel": 0,
        "index": 0,
        "start": 0.0,
        "end": 1.0,
        "sha256": "a" * 64,
    }
    job.state = "transcribing"
    job.stage = "dispatching"
    job.uncertain = True
    job.coverage = [chunk]
    await db.commit()
    return job, token, chunk


@pytest.mark.parametrize(
    "mutation",
    ["delete", "replace", "edit", "config", "revocation", "disabled", "key_revocation"],
)
@pytest.mark.parametrize("boundary", ["checkpoint", "final"])
async def test_real_write_race_discards_late_text(
    db, db_engine, recording, mutation, boundary
):
    job, token, chunk = await dispatched(db, recording)
    if mutation == "key_revocation":
        from app.models import UserAPIKey
        from app.services.transcription_jobs import SCOPES

        key = UserAPIKey(
            user_id=job.user_id,
            label="synthetic",
            key_prefix="synthetic",
            key_hash="unused",
            scopes=SCOPES,
        )
        db.add(key)
        await db.flush()
        job.api_key_id = key.id
        await db.commit()
    if boundary == "final":
        await checkpoint(db, job.id, token, chunk, SpeechResult("LATE-PRIVATE-TEXT"))
        await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    entered = asyncio.Event()
    async with sessions() as writer:
        if mutation in ("delete", "replace", "edit"):
            await writer.execute(
                update(Round)
                .where(Round.id == job.round_id)
                .values(media_generation=Round.media_generation)
            )
            if mutation == "delete":
                await writer.execute(
                    delete(RoundMedia).where(RoundMedia.id == job.media_id)
                )
            elif mutation == "replace":
                await writer.execute(
                    update(RoundMedia)
                    .where(RoundMedia.id == job.media_id)
                    .values(sha256="b" * 64)
                )
            else:
                await writer.execute(
                    update(Round)
                    .where(Round.id == job.round_id)
                    .values(transcript_generation=Round.transcript_generation + 1)
                )
        elif mutation == "config":
            from app.models import SystemSettings
            from app.services.ai_settings import lock_ai_settings

            await lock_ai_settings(writer)
            await writer.execute(
                update(SystemSettings)
                .where(SystemSettings.key == "speech_revision")
                .values(value=str(uuid4()))
            )
        elif mutation == "key_revocation":
            from datetime import UTC, datetime

            await writer.execute(
                update(UserAPIKey)
                .where(UserAPIKey.id == job.api_key_id)
                .values(revoked_at=datetime.now(UTC))
            )
        elif mutation == "disabled":
            await writer.execute(
                update(User).where(User.id == job.user_id).values(is_active=False)
            )
        else:
            await writer.execute(
                update(User)
                .where(User.id == job.user_id)
                .values(session_version=User.session_version + 1)
            )

        async def late():
            async with sessions() as session:
                entered.set()
                try:
                    if boundary == "checkpoint":
                        await checkpoint(
                            session,
                            job.id,
                            token,
                            chunk,
                            SpeechResult("LATE-PRIVATE-TEXT"),
                        )
                    else:
                        await publish_result(session, job.id, token, [chunk])
                    await session.commit()
                except HTTPException:
                    await session.rollback()
                    return "discarded"
                return "published"

        task = asyncio.create_task(late())
        await entered.wait()
        await asyncio.sleep(0.1)
        assert not task.done(), "Persistence bypassed a conflicting write transaction"
        await writer.commit()
        assert await asyncio.wait_for(task, 10) == "discarded"
    await db.refresh(recording[1])
    assert recording[1].current_transcript is None


async def test_simultaneous_publication_only_one_advances_generation(
    db, db_engine, recording
):
    job, token, chunk = await dispatched(db, recording)
    await checkpoint(db, job.id, token, chunk, SpeechResult("Winner"))
    await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def publish():
        async with sessions() as session:
            try:
                await publish_result(session, job.id, token, [chunk])
                await session.commit()
                return True
            except HTTPException:
                await session.rollback()
                return False

    assert sorted(await asyncio.gather(publish(), publish())) == [False, True]
    await db.refresh(recording[1])
    assert recording[1].transcript_generation == 1


async def wait_state(sessions, job_id, state):
    for _ in range(200):
        async with sessions() as session:
            job = await session.get(ProcessingJob, job_id)
            if job and job.state == state:
                return job
        await asyncio.sleep(0.05)
    raise AssertionError(
        f"Job did not reach {state}: {job.state if job else 'missing'}"
    )


async def test_lifespan_failure_no_automatic_retry_and_explicit_retry(
    db, db_engine, recording
):
    from app.services.transcription_jobs import retry_job

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with speech_fixture(500) as (endpoint, calls):
        job = await admitted(db, recording, endpoint)
        async with TranscriptionExecutor(sessions).lifespan():
            failed = await wait_state(sessions, job.id, "failed")
            assert failed.uncertain and not failed.checkpoints
            await asyncio.sleep(0.4)
            assert len(calls) == 1, "SDK/transport/executor retried a failed request"
        # A successor never replays a failed/uncertain request.
        async with TranscriptionExecutor(sessions).lifespan():
            await asyncio.sleep(0.3)
            assert len(calls) == 1
            intent = str(uuid4())
            async with sessions() as session:
                owner = await session.get(User, recording[0].id)
                await retry_job(session, AuthContext(owner, "jwt"), job.id, intent)
                await session.commit()
            await wait_state(sessions, job.id, "failed")
            assert len(calls) == 2
            # Lost-response replay of the same retry intent does not charge again.
            async with sessions() as session:
                owner = await session.get(User, recording[0].id)
                await retry_job(session, AuthContext(owner, "jwt"), job.id, intent)
                await session.commit()
            await asyncio.sleep(0.3)
            assert len(calls) == 2


async def test_other_process_ownership_precedes_reconciliation(
    db, db_engine, recording
):
    import sys

    job, _, _ = await dispatched(db, recording)
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    executor = TranscriptionExecutor(sessions)
    executor.root.mkdir(parents=True)
    lock = executor.root / "owner.lock"
    child = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import fcntl,sys; f=open(sys.argv[1],'a+b'); fcntl.flock(f,fcntl.LOCK_EX); print('owned',flush=True); sys.stdin.read(1)",
        str(lock),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
    )
    assert child.stdout is not None and child.stdin is not None
    assert await asyncio.wait_for(child.stdout.readline(), 10) == b"owned\n"
    inode = lock.stat().st_ino
    entered = asyncio.Event()
    release = asyncio.Event()

    async def successor():
        async with executor.lifespan():
            entered.set()
            await release.wait()

    task = asyncio.create_task(successor())
    try:
        await asyncio.sleep(0.3)
        assert not entered.is_set()
        await db.refresh(job)
        assert job.state == "transcribing", (
            "Reconciled while a live process owned execution"
        )
        child.stdin.write(b"x")
        await child.stdin.drain()
        await asyncio.wait_for(child.wait(), 10)
        await asyncio.wait_for(entered.wait(), 10)
        interrupted = await wait_state(sessions, job.id, "interrupted")
        assert interrupted.uncertain and lock.stat().st_ino == inode
    finally:
        release.set()
        await asyncio.wait_for(task, 10)
        if child.returncode is None:
            child.kill()
            await child.wait()


async def test_shutdown_retains_lock_until_owned_callback_finishes(
    db, db_engine, recording, monkeypatch
):
    from app.services import transcription_executor as module

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    job = await admitted(db, recording)
    called, cancelled, finish, release = (asyncio.Event() for _ in range(4))

    async def hung_callback(*args):
        called.set()
        try:
            await finish.wait()
        except asyncio.CancelledError:
            cancelled.set()
            await finish.wait()
        return SpeechResult("Owned callback finished")

    monkeypatch.setattr(module, "transcribe_chunk", hung_callback)
    first = TranscriptionExecutor(sessions)
    second = TranscriptionExecutor(sessions)

    async def owner():
        async with first.lifespan():
            await release.wait()

    task = asyncio.create_task(owner())
    await asyncio.wait_for(called.wait(), 10)
    release.set()
    await asyncio.wait_for(cancelled.wait(), 10)
    acquired = asyncio.Event()
    stop_second = asyncio.Event()

    async def successor():
        async with second.lifespan():
            acquired.set()
            await stop_second.wait()

    next_task = asyncio.create_task(successor())
    try:
        await asyncio.sleep(0.3)
        assert not acquired.is_set() and not first.accepting
        task.cancel()  # Repeated cancellation is still not ownership release.
        await asyncio.sleep(0.2)
        assert not acquired.is_set()
        finish.set()
        await asyncio.wait_for(task, 10)
        await asyncio.wait_for(acquired.wait(), 10)
    finally:
        finish.set()
        stop_second.set()
        await asyncio.gather(task, next_task, return_exceptions=True)


async def test_generated_archive_remaps_source_without_executable_jobs(
    db, db_engine, recording
):
    from app.services.export_registry import default_registry
    from app.services.export_service import ExportService
    from app.services.import_id_mapper import IDMapper
    from app.services.import_service import ImportService

    job, token, chunk = await dispatched(db, recording)
    await checkpoint(db, job.id, token, chunk, SpeechResult("Archive passage"))
    await db.commit()
    await publish_result(db, job.id, token, [chunk])
    await db.commit()
    await db.refresh(recording[1])
    payload = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            recording[0].id, session
        )
    )
    assert (
        "ProcessingJob" not in payload["models"]
        and "transcription_jobs" not in payload["models"]
    )
    # This test exercises structural archive remapping. Actual files are supplied
    # by the already-reviewed ZIP checksum/streaming boundary.
    mapper = IDMapper()
    imported = ImportService(default_registry, mapper)
    other = User(email="archive-target@synthetic.test", password_hash="unused")
    db.add(other)
    await db.commit()
    await db.run_sync(
        lambda session: imported.import_user_data(
            payload,
            other.id,
            session,
            file_mapping={recording[2].file_path: recording[2].file_path},
        )
    )
    await db.commit()
    restored_round = await db.get(Round, mapper.get("Round", recording[1].id))
    assert restored_round.current_transcript["coverage"] == "imported_audio"
    assert restored_round.current_transcript["source_media_id"] == mapper.get(
        "RoundMedia", recording[2].id
    )
    assert not await db.scalar(
        select(ProcessingJob.id).where(ProcessingJob.user_id == other.id)
    )


async def test_api_explicit_intent_dedup_underlying_scopes_and_queue_bound(
    client, db, db_engine, recording, monkeypatch
):
    from app.core.security import create_access_token, hash_api_key
    from app.main import app
    from app.models import UserAPIKey
    from app.services import transcription_jobs as service

    owner, round, media, _ = recording
    job = await admitted(db, recording)
    executor = TranscriptionExecutor(
        async_sessionmaker(db_engine, expire_on_commit=False)
    )
    executor.accepting = True
    monkeypatch.setattr(app.state, "transcription_executor", executor, raising=False)
    start_path = f"/api/rounds/{round.id}/media/{media.id}/transcription"
    headers = {
        "Request-Intent": job.intent_id,
        "Expected-Transcript-Generation": "0",
        "Speech-Configuration-Revision": job.config_revision,
    }
    # GET is status-only; repeated admission intent returns the same durable job.
    assert (await client.get(f"/api/rounds/{round.id}/transcriptions")).json()[0][
        "id"
    ] == job.id
    response = await client.post(start_path, headers=headers)
    assert response.status_code == 202 and response.json()["id"] == job.id
    raw = "synthetic-scoped-key"
    key = UserAPIKey(
        user_id=owner.id,
        label="test",
        key_prefix="synthetic",
        key_hash=hash_api_key(raw),
        scopes=["analytics:read"],
    )
    db.add(key)
    await db.commit()
    client.headers.pop("Authorization")
    client.headers["X-API-Key"] = raw
    assert (await client.get(f"/api/transcriptions/{job.id}")).status_code == 403
    assert (
        await client.get(f"/api/rounds/{round.id}/transcriptions")
    ).status_code == 403
    assert (await client.post(start_path, headers=headers)).status_code == 403
    key.scopes = ["rounds:read", "files:read"]
    await db.commit()
    assert (await client.get(f"/api/transcriptions/{job.id}")).status_code == 200
    assert (await client.post(start_path, headers=headers)).status_code == 403
    client.headers.pop("X-API-Key")
    client.headers["Authorization"] = "Bearer " + create_access_token(
        {"sub": owner.id, "session_version": owner.session_version}
    )
    # Prove bounded queue against another round, not merely same-round dedup.
    other_round = Round(
        application_id=round.application_id, round_type_id=round.round_type_id
    )
    db.add(other_round)
    await db.flush()
    other_media = RoundMedia(
        round_id=other_round.id,
        file_path=media.file_path,
        media_type="audio",
        sha256=media.sha256,
    )
    db.add(other_media)
    await db.commit()
    monkeypatch.setattr(service, "MAX_QUEUE", 1)
    response = await client.post(
        f"/api/rounds/{other_round.id}/media/{other_media.id}/transcription",
        headers={**headers, "Request-Intent": str(uuid4())},
    )
    assert response.status_code == 503 and "full" in response.text
    await db.rollback()
    await db.refresh(round)
    await db.refresh(job)
    assert (
        await client.delete(
            f"/api/rounds/{round.id}/transcript",
            headers={"Expected-Transcript-Generation": "0"},
        )
    ).status_code == 204
    await db.refresh(job)
    assert job.state == "invalidated" and not job.checkpoints


@pytest.mark.parametrize("format", ["wav", "mp4", "webm"])
async def test_real_short_audio_and_video_local_preparation(
    tmp_path, format, media_fixtures
):
    from app.services.transcription_audio import inspect_audio, prepare_channel

    source = media_fixtures / f"interview.{format}"
    digest, metadata, tracks, origin = await inspect_audio(source, None)
    assert len(digest) == 64 and tracks
    total = 0
    for track, stream in enumerate(tracks):
        for channel in range(int(stream["channels"])):
            chunks = await prepare_channel(
                source, tmp_path, track, channel, origin, metadata.extension
            )
            assert chunks[0][1]["start"] == 0
            assert abs(chunks[-1][1]["end"] - metadata.duration) < 0.2
            total += len(chunks)
            for path, _ in chunks:
                path.unlink()
    assert total > 0


async def test_two_hour_full_chunk_sample_timeline_bounds(tmp_path):
    """Preserve sample times across two hours of bounded audio chunks."""
    from app.services.transcription_audio import (
        MAX_PREPARED_BYTES,
        inspect_audio,
        prepare_channel,
    )

    path = tmp_path / "two-hours.wav"
    # Identifiable sample pulses at beginning/middle/end; write bounded blocks.
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(8000)
        silence = b"\0\0" * 8000
        for second in range(7200):
            wav.writeframesraw(
                (b"\x00\x20" * 8000) if second in (0, 3600, 7199) else silence
            )
    output = tmp_path / "prepared"
    output.mkdir()
    _, metadata, _, origin = await inspect_audio(path, None)
    chunks = await prepare_channel(path, output, 0, 0, origin, metadata.extension)
    assert 12 <= len(chunks) <= 13
    assert chunks[0][1]["start"] == 0 and chunks[-1][1]["end"] == 7200
    assert sum(file.stat().st_size for file, _ in chunks) <= MAX_PREPARED_BYTES
    previous = 0
    for file, chunk in chunks:
        assert chunk["start"] == previous
        previous = chunk["end"]
        assert file.stat().st_size <= 20_000_000
    for second in (0.5, 3600.5, 7199.5):
        file, chunk = next((f, c) for f, c in chunks if c["start"] <= second < c["end"])
        with wave.open(str(file), "rb") as wav:
            wav.setpos(round((second - chunk["start"]) * 16000))
            assert int.from_bytes(wav.readframes(1), "little", signed=True) > 1000
    for file, _ in chunks:
        file.unlink()
    path.unlink()


async def test_sdk_keyed_route_uses_only_installation_credential(tmp_path, monkeypatch):
    from app.services.ai_settings import CapabilitySettingsState
    from app.services.speech_openai import SpeechError, transcribe_chunk

    monkeypatch.setenv("OPENAI_API_KEY", "ambient-not-authorized")
    path = tmp_path / "chunk.wav"
    path.write_bytes(audio_bytes())
    async with speech_fixture() as (endpoint, calls):
        settings = CapabilitySettingsState(
            "whisper-1",
            "synthetic-installation-only",
            endpoint,
            provider="openai",
            kind="speech",
        )
        assert await transcribe_chunk(settings, path) == SpeechResult(
            "Synthetic contract passage"
        )
        headers, body = calls[0]
        assert b"Authorization: Bearer synthetic-installation-only" in headers
        assert b"ambient-not-authorized" not in headers + body
        settings.provider = "unsupported"
        with pytest.raises(SpeechError):
            await transcribe_chunk(settings, path)
        settings.provider = "openai"
        settings.base_url = endpoint + "?credential=not-supported"
        with pytest.raises(SpeechError):
            await transcribe_chunk(settings, path)
        assert len(calls) == 1


async def test_retry_reuses_revalidated_completed_chunk_after_uncertain_second(
    db, db_engine, recording
):
    from app.services.transcription_jobs import retry_job

    owner, _, media, path = recording
    data = audio_bytes(601)
    path.write_bytes(data)
    media.sha256 = hashlib.sha256(data).hexdigest()
    media.byte_count = len(data)
    await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with speech_fixture([200, 500, 200]) as (endpoint, calls):
        job = await admitted(db, recording, endpoint)
        async with TranscriptionExecutor(sessions).lifespan():
            failed = await wait_state(sessions, job.id, "failed")
            assert failed.uncertain and len(failed.checkpoints) == 1
            assert len(calls) == 2
        async with TranscriptionExecutor(sessions).lifespan():
            await asyncio.sleep(0.3)
            assert len(calls) == 2
            async with sessions() as session:
                fresh_owner = await session.get(User, owner.id)
                await retry_job(
                    session, AuthContext(fresh_owner, "jwt"), job.id, str(uuid4())
                )
                await session.commit()
            complete = await wait_state(sessions, job.id, "complete")
            assert complete.coverage[-1]["end"] == 601
            assert len(calls) == 3
            assert len(calls[0][1]) > 19_000_000
            assert len(calls[1][1]) < 100_000 and len(calls[2][1]) < 100_000


async def test_intake_and_preparation_share_decoder_until_callback_finishes(
    tmp_path, monkeypatch
):
    from app.services import media_intake

    entered = asyncio.Event()
    release = asyncio.Event()
    calls = []

    async def callback(mode, path, *args):
        calls.append(mode)
        if mode == "first":
            entered.set()
            await release.wait()
        return b"checked"

    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    monkeypatch.setattr(media_intake, "_run_media_process", callback)
    first = asyncio.create_task(
        media_intake.run_media_process("first", tmp_path / "audio")
    )
    await entered.wait()
    second = asyncio.create_task(
        media_intake.run_media_process("second", tmp_path / "audio")
    )
    await asyncio.sleep(0.2)
    assert calls == ["first"]
    release.set()
    assert await asyncio.gather(first, second) == [b"checked", b"checked"]
    assert calls == ["first", "second"]


async def test_process_death_after_real_sdk_dispatch_reconciles_without_replay(
    db, db_engine, recording
):
    import os
    import sys

    hold = asyncio.Event()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with speech_fixture(hold=hold) as (endpoint, calls):
        job = await admitted(db, recording, endpoint)
        env = dict(
            os.environ,
            DATABASE_URL=db_engine.url.render_as_string(hide_password=False),
            UPLOAD_DIR=str(recording[3].parent),
            PYTHONPATH=str(Path.cwd()),
        )
        program = """import asyncio
from app.services.transcription_executor import TranscriptionExecutor
async def main():
    async with TranscriptionExecutor().lifespan():
        await asyncio.sleep(120)
asyncio.run(main())
"""
        child = await asyncio.create_subprocess_exec(
            sys.executable,
            "-c",
            program,
            env=env,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            assert child.stderr is not None
            for _ in range(600):
                if calls:
                    break
                if child.returncode is not None:
                    raise AssertionError((await child.stderr.read()).decode())
                await asyncio.sleep(0.05)
            assert len(calls) == 1, "Child never reached the local HTTP speech fixture"
            active = await wait_state(sessions, job.id, "transcribing")
            assert active.stage == "dispatching" and active.uncertain
            child.kill()
            await asyncio.wait_for(child.wait(), 10)
            async with TranscriptionExecutor(sessions).lifespan():
                interrupted = await wait_state(sessions, job.id, "interrupted")
                assert interrupted.uncertain and not interrupted.checkpoints
                await asyncio.sleep(0.3)
                assert len(calls) == 1, "Successor replayed uncertain remote work"
        finally:
            if child.returncode is None:
                child.kill()
                await child.wait()
            # Remote fixture ownership is separate; local death did not cancel it.
            hold.set()


async def test_api_key_dependency_and_worker_have_no_lock_cycle(
    client, db, db_engine, recording, monkeypatch
):
    """Pause the real HTTP dependency before ordered admission, not a fake AuthContext."""
    from app.core.database import get_db
    from app.core.security import hash_api_key
    from app.main import app
    from app.models import UserAPIKey
    from app.services import transcription_jobs as service

    job, token, chunk = await dispatched(db, recording)
    raw = "synthetic-lock-order-key"
    key = UserAPIKey(
        user_id=job.user_id,
        label="lock-order",
        key_prefix="synthetic",
        key_hash=hash_api_key(raw),
        scopes=service.SCOPES,
    )
    db.add(key)
    await db.flush()
    job.api_key_id = key.id
    await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    authenticated, worker_locked = asyncio.Event(), asyncio.Event()
    real_lock = service.lock_ai_settings

    async def ordered_lock(session):
        if session.info.get("http_request"):
            authenticated.set()
            await asyncio.wait_for(worker_locked.wait(), 7)
            await real_lock(session)
        else:
            await real_lock(session)
            worker_locked.set()

    async def request_db():
        async with sessions(info={"http_request": True}) as session:
            yield session

    monkeypatch.setitem(app.dependency_overrides, get_db, request_db)
    monkeypatch.setattr(service, "lock_ai_settings", ordered_lock)
    executor = TranscriptionExecutor(sessions)
    executor.accepting = True
    monkeypatch.setattr(app.state, "transcription_executor", executor, raising=False)
    client.headers.pop("Authorization")

    async def worker():
        await asyncio.wait_for(authenticated.wait(), 7)
        async with sessions() as session:
            await checkpoint(
                session, job.id, token, chunk, SpeechResult("Concurrent checkpoint")
            )
            await session.commit()

    request = asyncio.create_task(
        client.post(
            f"/api/rounds/{job.round_id}/media/{job.media_id}/transcription",
            headers={
                "X-API-Key": raw,
                "Request-Intent": job.intent_id,
                "Expected-Transcript-Generation": "0",
                "Speech-Configuration-Revision": job.config_revision,
            },
        )
    )
    work = asyncio.create_task(worker())
    try:
        response, _ = await asyncio.wait_for(asyncio.gather(request, work), 10)
        assert response.status_code == 202, response.text
        await db.refresh(job)
        await db.refresh(key)
        assert job.checkpoints[0]["text"] == "Concurrent checkpoint"
        assert key.last_used_at is not None
    finally:
        for task in (request, work):
            if not task.done():
                task.cancel()
        await asyncio.gather(request, work, return_exceptions=True)


async def test_api_key_bookkeeping_does_not_commit_caller_mutations(
    db, db_engine, recording
):
    from app.core.deps import get_current_auth_context
    from app.core.security import hash_api_key
    from app.models import UserAPIKey
    from app.services.transcription_jobs import SCOPES

    owner, round, _, _ = recording
    key = UserAPIKey(
        user_id=owner.id,
        label="bookkeeping",
        key_prefix="synthetic",
        key_hash=hash_api_key("synthetic-bookkeeping-key"),
        scopes=SCOPES,
    )
    db.add(key)
    await db.commit()
    round_id, key_id = round.id, key.id
    round.transcript_summary = "UNCOMMITTED caller content"
    await get_current_auth_context(None, "synthetic-bookkeeping-key", db)
    await db.rollback()
    async with async_sessionmaker(db_engine)() as check:
        saved = await check.get(Round, round_id)
        saved_key = await check.get(UserAPIKey, key_id)
        assert saved is not None and saved_key is not None
        assert saved.transcript_summary is None
        assert saved_key.last_used_at is not None


@pytest.mark.parametrize("concurrent_edit", [False, True])
async def test_publication_preserves_manual_summary_during_local_response(
    client, db, db_engine, recording, concurrent_edit
):
    round_id = recording[1].id
    response = await client.patch(
        f"/api/rounds/{round_id}", json={"transcript_summary": "Initial human summary"}
    )
    assert response.status_code == 200, response.text
    hold = asyncio.Event()
    async with speech_fixture(hold=hold) as (endpoint, calls):
        job = await admitted(db, recording, endpoint)
        token = await claim(db, job)
        executor = TranscriptionExecutor(
            async_sessionmaker(db_engine, expire_on_commit=False)
        )
        executor.root.mkdir(parents=True)
        executor.accepting = True
        task = asyncio.create_task(executor.execute(job.id, token))
        try:
            async with asyncio.timeout(10):
                while not calls:
                    await asyncio.sleep(0.02)
            expected = "Initial human summary"
            if concurrent_edit:
                expected = "Human summary saved while speech is pending"
                response = await client.patch(
                    f"/api/rounds/{round_id}", json={"transcript_summary": expected}
                )
                assert response.status_code == 200, response.text
                assert response.json()["transcript_generation"] == 0
            hold.set()
            await asyncio.wait_for(task, 10)
        finally:
            hold.set()
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    await db.refresh(job)
    await db.refresh(recording[1])
    assert job.state == "complete" and not job.checkpoints
    assert recording[1].transcript_generation == 1
    assert recording[1].current_transcript["coverage"] == "complete_audio"
    assert recording[1].transcript_summary == expected


@pytest.mark.parametrize("start_origin", [0.0, 2.0, -0.5])
async def test_container_origin_normalized_once_with_gap_and_delayed_track(
    tmp_path, start_origin
):
    import struct
    import subprocess

    from app.services.transcription_audio import inspect_audio, prepare_channel

    # Four seconds primary / three seconds secondary, 10-ms packets for exact gaps.
    for name, seconds, markers, amplitude in [
        ("primary", 4, (0.1, 2.0, 3.8), 8000),
        ("secondary", 3, (0.1, 1.5, 2.8), 12000),
    ]:
        with wave.open(str(tmp_path / f"{name}.wav"), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(
                b"".join(
                    struct.pack(
                        "<h",
                        amplitude
                        if any(m <= i / 16000 < m + 0.1 for m in markers)
                        else 1000,
                    )
                    for i in range(seconds * 16000)
                )
            )
    source = tmp_path / "origins.mka"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-copyts",
            "-i",
            str(tmp_path / "primary.wav"),
            "-i",
            str(tmp_path / "secondary.wav"),
            "-filter_complex",
            f"[0:a]asetnsamples=n=160,aselect='not(between(t,1,1.499))',asetpts=PTS+({start_origin})/TB[a];"
            f"[1:a]asetnsamples=n=160,asetpts=PTS+({start_origin + 0.75})/TB[b]",
            "-map",
            "[a]",
            "-map",
            "[b]",
            "-c:a",
            "pcm_s16le",
            "-avoid_negative_ts",
            "disabled",
            str(source),
        ],
        check=True,
        capture_output=True,
        timeout=20,
    )
    probe = json.loads(
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(source),
            ],
            check=True,
            capture_output=True,
            timeout=10,
        ).stdout
    )
    _, metadata, tracks, origin = await inspect_audio(source, None)
    assert origin == pytest.approx(start_origin, abs=0.001), probe
    assert len(tracks) == 2
    assert float(tracks[1]["start_time"]) - origin == pytest.approx(0.75, abs=0.001)
    for track, endpoint, markers, amplitude in [
        (0, 4.0, (0.15, 2.05, 3.85), 8000),
        (1, 3.75, (0.90, 2.30, 3.60), 12000),
    ]:
        output = tmp_path / f"prepared-{track}"
        output.mkdir()
        chunks = await prepare_channel(
            source, output, track, 0, origin, metadata.extension
        )
        assert len(chunks) == 1
        file, chunk = chunks[0]
        with wave.open(str(file), "rb") as wav:
            samples = struct.unpack(
                f"<{wav.getnframes()}h", wav.readframes(wav.getnframes())
            )
        measured = [
            samples[round(t * 16000)] if t * 16000 < len(samples) else None
            for t in markers
        ]
        assert chunk["start"] == 0 and chunk["end"] == pytest.approx(
            endpoint, abs=0.001
        )
        assert measured == [amplitude] * 3
        assert samples[round((1.25 if track == 0 else 0.5) * 16000)] == 0
        assert samples[round((0.5 if track == 0 else 1.25) * 16000)] == 1000


async def test_local_silence_threshold_classification(tmp_path):
    """Local dead-air classification is conservative and never guesses speech."""
    from app.services.transcription_audio import (
        SILENCE_RMS_THRESHOLD,
        is_effectively_silent,
    )

    silent = tmp_path / "silent.wav"
    silent.write_bytes(silent_audio_bytes(1))
    quiet = tmp_path / "quiet.wav"
    quiet.write_bytes(quiet_audio_bytes(1, amplitude=SILENCE_RMS_THRESHOLD + 1))
    audible = tmp_path / "audible.wav"
    audible.write_bytes(audio_bytes(1))
    empty = tmp_path / "empty.wav"
    empty.write_bytes(_wav(b""))
    assert is_effectively_silent(silent)
    assert not is_effectively_silent(quiet)
    assert not is_effectively_silent(audible)
    # A header-only file is dead air, not an EOFError.
    assert is_effectively_silent(empty)


async def test_silence_scan_runs_off_the_event_loop(
    db, db_engine, recording, monkeypatch
):
    """The blocking PCM scan must not run on the event loop thread."""
    import threading

    from app.services import transcription_executor as executor_module

    loop_thread = threading.get_ident()
    observed = []
    real = executor_module.is_effectively_silent

    def record(path):
        observed.append(threading.get_ident())
        return real(path)

    monkeypatch.setattr(executor_module, "is_effectively_silent", record)
    owner, round, media, path = recording
    data = mixed_audio_bytes(silent_seconds=601, audible_seconds=0.5)
    path.write_bytes(data)
    media.sha256 = hashlib.sha256(data).hexdigest()
    media.byte_count = len(data)
    await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with speech_fixture() as (endpoint, _calls):
        job = await admitted(db, recording, endpoint)
        async with TranscriptionExecutor(sessions).lifespan():
            await wait_state(sessions, job.id, "complete")
    assert observed and all(thread != loop_thread for thread in observed)


async def test_silent_chunk_is_not_dispatched_but_keeps_full_coverage(
    db, db_engine, recording
):
    """A silent chunk must not fail the job; coverage stays complete and ordered."""
    owner, round, media, path = recording
    # 601 s: the first prepared chunk is pure dead air, the tail chunk is audible.
    data = mixed_audio_bytes(silent_seconds=601, audible_seconds=0.5)
    path.write_bytes(data)
    media.sha256 = hashlib.sha256(data).hexdigest()
    media.byte_count = len(data)
    await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with speech_fixture() as (endpoint, calls):
        job = await admitted(db, recording, endpoint)
        async with TranscriptionExecutor(sessions).lifespan():
            complete = await wait_state(sessions, job.id, "complete")
        assert len(complete.coverage) == 2
        assert complete.coverage[0]["start"] == 0
        assert complete.coverage[-1]["end"] == 601
        assert complete.coverage[0]["end"] == complete.coverage[1]["start"]
        assert complete.checkpoints == []
        assert not complete.uncertain
        # Exactly the audible tail was dispatched; the silent chunk stayed local.
        assert len(calls) == 1
    await db.refresh(recording[1])
    assert recording[1].transcript_generation == 1
    assert recording[1].current_transcript["coverage"] == "complete_audio"


async def test_fully_silent_recording_ends_honest_not_success(db, db_engine, recording):
    """All-dead-air input yields a specific non-success outcome, never fake text."""
    owner, round, media, path = recording
    data = silent_audio_bytes(1)
    path.write_bytes(data)
    media.sha256 = hashlib.sha256(data).hexdigest()
    media.byte_count = len(data)
    await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with speech_fixture() as (endpoint, calls):
        job = await admitted(db, recording, endpoint)
        async with TranscriptionExecutor(sessions).lifespan():
            failed = await wait_state(sessions, job.id, "failed")
        assert not calls, "A silent recording must not contact the provider"
        assert failed.error and "No speech detected" in failed.error
        assert not failed.uncertain
    await db.refresh(recording[1])
    assert recording[1].current_transcript is None
    assert recording[1].transcript_generation == 0


async def test_genuine_provider_error_still_fails_the_job(db, db_engine, recording):
    """A real engine error is never converted into empty text."""
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with speech_fixture(500) as (endpoint, calls):
        job = await admitted(db, recording, endpoint)
        async with TranscriptionExecutor(sessions).lifespan():
            failed = await wait_state(sessions, job.id, "failed")
        assert len(calls) == 1
        assert failed.uncertain and not failed.checkpoints
        assert "No speech detected" not in (failed.error or "")
