"""Bounded recording intake, actual local decoders and transactional source identity."""

import asyncio
import hashlib
import io
import os
import wave
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.services import media_intake as intake
from app.services.upload_storage import publish_file


def wav_bytes(seconds=1, rate=8000):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b"\0\0" * rate * seconds)
    return output.getvalue()


def multipart(content, filename="sample.wav", extra=b""):
    return (
        b'--recording\r\nContent-Disposition: form-data; name="file"; filename="'
        + filename.encode()
        + b'"\r\nContent-Type: audio/wav\r\n\r\n'
        + content
        + b"\r\n--recording--\r\n"
        + extra
    )


def request_for(body, chunk_size=65536, headers=None):
    chunks = [body[i : i + chunk_size] for i in range(0, len(body), chunk_size)]

    async def receive():
        chunk = chunks.pop(0) if chunks else b""
        return {"type": "http.request", "body": chunk, "more_body": bool(chunks)}

    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/",
            "headers": headers
            or [(b"content-type", b"multipart/form-data; boundary=recording")],
        },
        receive,
    )


async def test_spool_recording_stream_hash_filename_and_cleanup(tmp_path):
    content = wav_bytes()
    with intake.intake_slot(tmp_path) as path:
        filename, digest, size = await intake.spool_recording(
            request_for(multipart(content, "../sample.wav"), 71), path
        )
        assert filename == "sample.wav"
        assert digest == hashlib.sha256(content).hexdigest()
        assert size == len(content) and path.read_bytes() == content
    assert not path.exists()


@pytest.mark.parametrize(
    "case", ["oversize", "envelope", "headers", "incomplete", "empty", "two_parts"]
)
async def test_spool_recording_rejects_bounded_negative_streams(
    tmp_path, monkeypatch, case
):
    monkeypatch.setattr(intake, "MAX_MEDIA_BYTES", 1000)
    content = multipart(b"x" * 1001) if case == "oversize" else multipart(b"x")
    if case == "envelope":
        content += b"x" * (intake.MAX_ENVELOPE_BYTES + 1)
    if case == "headers":
        content = multipart(b"x", "x" * 8193)
    if case == "incomplete":
        content = content[:-15]
    if case == "empty":
        content = multipart(b"")
    if case == "two_parts":
        content = multipart(b"x").replace(
            b"--recording--",
            b"--recording\r\nContent-Disposition: form-data; name=extra\r\n\r\nx\r\n--recording--",
        )
    with pytest.raises(HTTPException) as caught, intake.intake_slot(tmp_path) as path:
        await intake.spool_recording(request_for(content, 113), path)
    assert caught.value.status_code in (400, 413)
    assert not path.exists()


async def test_validate_recording_actual_wav(tmp_path):
    path = tmp_path / "recording.part"
    path.write_bytes(wav_bytes())
    result = await intake.validate_recording(path)
    assert (
        result.duration == 1
        and result.media_type == "audio"
        and result.extension == ".wav"
    )


@pytest.mark.parametrize(
    "content",
    [
        b"not media",
        b"RIFF\x00\x00\x00\x00WAVEcorrupt",
        b"#EXTM3U\nhttp://127.0.0.1/private.wav\n",
    ],
)
async def test_validate_recording_rejects_corrupt_and_remote_protocols(
    tmp_path, content
):
    path = tmp_path / "recording.part"
    path.write_bytes(content)
    with pytest.raises(HTTPException) as caught:
        await intake.validate_recording(path)
    assert caught.value.status_code == 422
    assert "127.0.0.1" not in caught.value.detail


def test_intake_slot_admission_crash_recovery_and_disk_reserve(tmp_path, monkeypatch):
    with intake.intake_slot(tmp_path) as path:
        path.write_bytes(b"partial")
        with pytest.raises(HTTPException) as caught, intake.intake_slot(tmp_path):
            pass
        assert caught.value.status_code == 503 and path.read_bytes() == b"partial"
    path.write_bytes(b"crash residue")
    with intake.intake_slot(tmp_path) as recovered:
        assert recovered == path and not recovered.exists()
    monkeypatch.setattr(
        intake.shutil, "disk_usage", lambda _: type("Usage", (), {"free": 1})()
    )
    with pytest.raises(HTTPException) as caught, intake.intake_slot(tmp_path):
        pass
    assert caught.value.status_code == 507


def test_publish_recording_does_not_overwrite_or_remove_shared_cas(tmp_path):
    content = wav_bytes()
    digest = hashlib.sha256(content).hexdigest()
    with intake.intake_slot(tmp_path) as path:
        path.write_bytes(content)
        stored = publish_file(path, tmp_path, digest, ".wav")
        assert publish_file(path, tmp_path, digest, ".wav") == stored
    destination = tmp_path / Path(stored).name
    assert destination.read_bytes() == content
    destination.write_bytes(b"bad preexisting blob")
    with intake.intake_slot(tmp_path) as path:
        path.write_bytes(content)
        with pytest.raises(OSError):
            publish_file(path, tmp_path, digest, ".wav")
    assert destination.read_bytes() == b"bad preexisting blob"


@pytest.mark.parametrize(
    "filename",
    [
        "interview.wav",
        "interview.mp3",
        "interview.m4a",
        "interview.mp4",
        "interview.webm",
        "no-audio.mp4",
        "corrupt.wav",
    ],
)
async def test_validate_recording_existing_synthetic_fixtures(filename):
    root = os.environ.get("S08_MEDIA_FIXTURES")
    if not root:
        pytest.skip(
            "Set S08_MEDIA_FIXTURES to the prepared synthetic fixture directory"
        )
    path = Path(root) / filename
    if filename in ("no-audio.mp4", "corrupt.wav"):
        with pytest.raises(HTTPException):
            await intake.validate_recording(path)
    else:
        result = await intake.validate_recording(path)
        assert 20 <= result.duration < 22


from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace

from app.core.security import create_access_token
from app.models import Round, RoundMedia
from app.services.round_media import claim_media_generation


@pytest.fixture
async def recording_round(client, workspace):
    response = await client.post(
        f"/api/applications/{workspace[4]}/rounds",
        json={"round_type_id": workspace[3][0].id},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def upload(client, round_id, content=None, generation=0, replace_id=None):
    headers = {"Expected-Media-Generation": str(generation)}
    if replace_id:
        headers["Replace-Media-Id"] = replace_id
    return await client.post(
        f"/api/rounds/{round_id}/media",
        headers=headers,
        files={
            "file": (
                "..\\safe-recording.wav",
                content if content is not None else wav_bytes(),
                "audio/wav",
            )
        },
    )


async def test_recording_router_identity_replace_delete_preserves_independent_transcript(
    client, db, workspace, recording_round
):
    path = f"/api/rounds/{recording_round}/transcript"
    pasted = await client.put(
        path,
        json={"text": "independent pasted words"},
        headers={"Expected-Transcript-Generation": "0"},
    )
    assert pasted.status_code == 200
    original = await upload(client, recording_round)
    assert original.status_code == 200, original.text
    media = original.json()["media"][0]
    assert media["byte_count"] == len(wav_bytes())
    assert media["sha256"] == hashlib.sha256(wav_bytes()).hexdigest()
    assert media["validation"] == "audio_decode_check"
    assert original.json()["media_generation"] == 1
    grant = (await client.get(f"/api/files/media/{media['id']}/signed")).json()["url"]
    good = await client.get(grant)
    assert good.content == wav_bytes() and good.headers["content-type"] == "audio/x-wav"
    bad = await upload(
        client, recording_round, b"corrupt private canary", 1, media["id"]
    )
    assert bad.status_code == 422 and "private canary" not in bad.text
    assert (await client.get(grant)).content == wav_bytes()
    replacement = await upload(client, recording_round, wav_bytes(2), 1, media["id"])
    assert replacement.status_code == 200, replacement.text
    newest = replacement.json()["media"][0]
    assert newest["id"] != media["id"] and newest["sha256"] != media["sha256"]
    assert (await client.get(grant)).status_code == 404
    assert (
        await upload(client, recording_round, generation=1, replace_id=newest["id"])
    ).status_code == 409
    assert (
        await client.delete(
            f"/api/media/{newest['id']}", headers={"Expected-Media-Generation": "1"}
        )
    ).status_code == 409
    assert (
        await client.delete(
            f"/api/media/{newest['id']}", headers={"Expected-Media-Generation": "2"}
        )
    ).status_code == 204
    assert (await client.get(path)).json() == pasted.json()
    assert (
        await db.scalar(
            select(RoundMedia.id).where(RoundMedia.round_id == recording_round)
        )
        is None
    )
    stored_round = await db.get(Round, recording_round, populate_existing=True)
    assert stored_round.media_generation == 3


async def test_recording_router_does_not_read_unauthorized_body(
    client, workspace, recording_round
):
    reads = []

    async def body():
        reads.append(True)
        yield b"large body must not be read"

    saved = client.headers.pop("Authorization")
    result = await client.post(
        f"/api/rounds/{recording_round}/media",
        content=body(),
        headers={"Content-Type": "multipart/form-data; boundary=recording"},
    )
    assert result.status_code == 401 and not reads
    client.headers["Authorization"] = "Bearer " + create_access_token(
        {"sub": workspace[1].id, "session_version": workspace[1].session_version}
    )
    result = await client.post(f"/api/rounds/{recording_round}/media", content=body())
    assert result.status_code == 404 and not reads
    client.headers["Authorization"] = saved


async def test_recording_router_stream_and_envelope_limits_preserve_saved_media(
    client, workspace, recording_round, monkeypatch
):
    good = await upload(client, recording_round)
    assert good.status_code == 200, good.text
    monkeypatch.setattr(intake, "MAX_MEDIA_BYTES", 1000)

    async def body():
        for chunk in (multipart(b"x" * 1001)[:150], multipart(b"x" * 1001)[150:]):
            yield chunk

    result = await client.post(
        f"/api/rounds/{recording_round}/media",
        content=body(),
        headers={
            "Content-Type": "multipart/form-data; boundary=recording",
            "Expected-Media-Generation": "1",
        },
    )
    assert result.status_code == 413, result.text
    result = await client.post(
        f"/api/rounds/{recording_round}/media",
        content=b"",
        headers={
            "Content-Type": "multipart/form-data; boundary=recording",
            "Content-Length": "1000016385",
        },
    )
    assert result.status_code == 413
    assert (
        await client.get(f"/api/files/media/{good.json()['media'][0]['id']}")
    ).content == wav_bytes()


async def test_recording_storage_failure_keeps_prior_source(
    client, db, workspace, recording_round, monkeypatch
):
    from app.api import rounds

    good = await upload(client, recording_round)
    media = good.json()["media"][0]

    def fail(*args):
        raise OSError("private disk path")

    monkeypatch.setattr(rounds, "publish_file", fail)
    result = await upload(client, recording_round, wav_bytes(2), 1, media["id"])
    assert result.status_code == 507 and "private disk" not in result.text
    current = await db.get(Round, recording_round, populate_existing=True)
    assert current.media_generation == 1
    assert (await client.get(f"/api/files/media/{media['id']}")).content == wav_bytes()


@pytest.mark.parametrize("operation", ["upload", "replace", "delete"])
async def test_round_media_atomic_two_session_generation_and_late_deleted_parent(
    db_engine, client, workspace, recording_round, operation
):
    owner = workspace[0].id
    original = await upload(client, recording_round)
    old_id = original.json()["media"][0]["id"]
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    ready = asyncio.Event()
    observed = []

    async def mutate(label):
        async with sessions() as session:
            current = await session.get(Round, recording_round)
            assert current is not None
            observed.append(current.media_generation)
            if len(observed) == 2:
                ready.set()
            await asyncio.wait_for(ready.wait(), 5)
            try:
                await claim_media_generation(session, recording_round, owner, 1)
                if operation in ("replace", "delete"):
                    await session.execute(
                        delete(RoundMedia).where(RoundMedia.id == old_id)
                    )
                if operation != "delete":
                    session.add(
                        RoundMedia(
                            round_id=recording_round,
                            file_path="uploads/" + label,
                            media_type="audio",
                        )
                    )
                await session.commit()
                return "ok"
            except HTTPException as error:
                return error.status_code

    outcomes = await asyncio.gather(mutate("winner-a.wav"), mutate("winner-b.wav"))
    assert sorted(map(str, outcomes)) == ["409", "ok"]
    assert observed == [1, 1]
    assert (await client.delete(f"/api/rounds/{recording_round}")).status_code == 204
    async with sessions() as session:
        with pytest.raises(HTTPException) as error:
            await claim_media_generation(session, recording_round, owner, 2)
        assert error.value.status_code == 409
        assert await session.get(Round, recording_round) is None
        assert not list(
            (
                await session.scalars(
                    select(RoundMedia).where(RoundMedia.round_id == recording_round)
                )
            ).all()
        )


@pytest.mark.parametrize("case", ["timeout", "cancel", "output", "spawn_cancel"])
async def test_run_media_process_timeout_cancellation_output_and_owned_reaping(
    tmp_path, monkeypatch, case
):
    import sys

    program = tmp_path / "ffmpeg"
    program.write_text(
        f"#!{sys.executable}\nimport sys,time\n"
        + (
            "sys.stdout.write('x'*100000); sys.stdout.flush()\n"
            if case == "output"
            else "time.sleep(60)\n"
        )
    )
    program.chmod(0o700)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setattr(intake, "PROCESS_SECONDS", 0.2)
    processes = []
    created = asyncio.Event()
    spawn = asyncio.create_subprocess_exec

    async def track(*args, **kwargs):
        process = await spawn(*args, **kwargs)
        processes.append(process)
        created.set()
        if case == "spawn_cancel":
            await asyncio.sleep(0.1)
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", track)
    task = asyncio.create_task(
        intake.run_media_process("decode", tmp_path / "owned.part")
    )
    await created.wait()
    if case in ("cancel", "spawn_cancel"):
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        with pytest.raises(HTTPException) as error:
            await task
        assert error.value.status_code == 422
    assert len(processes) == 1 and processes[0].returncode is not None
    with pytest.raises(ProcessLookupError):
        os.kill(processes[0].pid, 0)


@pytest.mark.parametrize("false_media", [False, True])
async def test_recording_archive_stream_identity_remap_claims_unverified_and_safe_download(
    client, db, workspace, recording_round, tmp_path, monkeypatch, false_media
):
    import json
    import zipfile

    from app.api import rounds
    from app.api.utils.zip_utils import create_zip_export_file
    from app.services import import_execution
    from app.services.export_registry import default_registry
    from app.services.export_service import ExportService
    from app.services.import_id_mapper import IDMapper
    from app.services.import_service import ImportService

    uploads = tmp_path / "uploads"
    monkeypatch.setattr(rounds.settings, "upload_dir", str(uploads))
    original = await upload(client, recording_round)
    assert original.status_code == 200, original.text
    media = original.json()["media"][0]
    exported = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[0].id, session
        )
    )
    row = exported["models"]["RoundMedia"][0]
    assert row["sha256"] == media["sha256"] and row["probed_duration_seconds"] == 1
    archive = Path(
        await create_zip_export_file(
            json.dumps(exported), workspace[0].id, str(uploads)
        )
    )
    try:
        if false_media:
            with zipfile.ZipFile(archive) as source:
                manifest = json.loads(source.read("manifest.json"))
            content = b"<html><script>window.privateSource=true</script></html>"
            digest = hashlib.sha256(content).hexdigest()
            row.update(
                sha256=digest, byte_count=len(content), probed_duration_seconds=7199
            )
            member, info = next(iter(manifest["files"].items()))
            info.update(sha256=digest, size_bytes=len(content), mime_type="audio/wav")
            with zipfile.ZipFile(archive, "w") as destination:
                destination.writestr("data.json", json.dumps(exported))
                destination.writestr("manifest.json", json.dumps(manifest))
                destination.writestr(member, content)
        else:
            content = wav_bytes()
        restored_root = tmp_path / "restored"
        monkeypatch.setattr(import_execution, "UPLOAD_DIR", str(restored_root))
        mapping = import_execution.extract_files_from_new_format(
            str(archive), workspace[1].id
        )
        assert (
            restored_root / Path(mapping[media["file_path"]]).name
        ).read_bytes() == content
        importer = ImportService(default_registry, IDMapper())
        await db.run_sync(
            lambda session: importer.import_user_data(
                exported, workspace[1].id, session, file_mapping=mapping
            )
        )
        await db.commit()
        restored = await db.get(
            RoundMedia, importer.id_mapper.get("RoundMedia", media["id"])
        )
        assert (
            restored.id != media["id"] and restored.validation == "imported_unverified"
        )
        assert restored.sha256 == hashlib.sha256(content).hexdigest()
        assert restored.probed_duration_seconds == (7199 if false_media else 1)
        monkeypatch.setattr(rounds.settings, "upload_dir", str(restored_root))
        client.headers["Authorization"] = "Bearer " + create_access_token(
            {"sub": workspace[1].id, "session_version": workspace[1].session_version}
        )
        result = await client.get(f"/api/files/media/{restored.id}?disposition=inline")
        assert result.content == content
        assert result.headers["content-type"] == "application/octet-stream"
        assert result.headers["content-disposition"].startswith("attachment;")
        assert result.headers["x-content-type-options"] == "nosniff"
        # False archival claims never become locally verified or a speech-ready source.
        assert restored.validation != "audio_decode_check"
    finally:
        archive.unlink(missing_ok=True)


async def test_recording_archive_rejects_missing_and_mismatched_source(
    client, db, workspace, recording_round, tmp_path, monkeypatch
):
    import json

    from app.api import rounds
    from app.api.utils.zip_utils import create_zip_export_file
    from app.services.export_registry import default_registry
    from app.services.export_service import ExportService

    uploads = tmp_path / "uploads"
    monkeypatch.setattr(rounds.settings, "upload_dir", str(uploads))
    original = await upload(client, recording_round)
    media = original.json()["media"][0]
    exported = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[0].id, session
        )
    )
    source = uploads / Path(media["file_path"]).name
    source.write_bytes(b"corrupted")
    with pytest.raises(ValueError, match="integrity mismatch"):
        await create_zip_export_file(
            json.dumps(exported), workspace[0].id, str(uploads)
        )
    source.unlink()
    with pytest.raises(ValueError, match="missing or unavailable"):
        await create_zip_export_file(
            json.dumps(exported), workspace[0].id, str(uploads)
        )


@pytest.mark.parametrize("remove", ["media", "round", "application", "user"])
async def test_recording_real_router_late_upload_cannot_resurrect_deletion(
    db_engine, db, client, workspace, recording_round, monkeypatch, remove
):
    from app.api import rounds
    from app.core.database import get_db
    from app.main import app
    from app.models import User

    original = await upload(client, recording_round)
    old_id = original.json()["media"][0]["id"]
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def independent_db():
        async with sessions() as session:
            yield session

    previous = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = independent_db
    ready, release = asyncio.Event(), asyncio.Event()
    validate = rounds.validate_recording

    async def pause_after_actual_validation(path):
        result = await validate(path)
        ready.set()
        await release.wait()
        return result

    monkeypatch.setattr(rounds, "validate_recording", pause_after_actual_validation)
    pending = asyncio.create_task(
        upload(client, recording_round, wav_bytes(2), 1, old_id)
    )
    try:
        await asyncio.wait_for(ready.wait(), 10)
        # Admission has no waiting queue and never spools a second recording.
        rejected = await upload(client, recording_round, generation=1)
        assert rejected.status_code == 503, rejected.text
        if remove == "user":
            admin = User(
                email="deletion-admin@media.test", password_hash="unused", is_admin=True
            )
            db.add(admin)
            await db.commit()
            response = await client.delete(
                f"/api/admin/users/{workspace[0].id}",
                headers={
                    "Authorization": "Bearer "
                    + create_access_token(
                        {"sub": admin.id, "session_version": admin.session_version}
                    )
                },
            )
        else:
            endpoint = {
                "media": f"/api/media/{old_id}",
                "round": f"/api/rounds/{recording_round}",
                "application": f"/api/applications/{workspace[4]}",
            }[remove]
            response = await client.delete(endpoint)
        assert response.status_code == 204, response.text
        release.set()
        result = await pending
        assert result.status_code == (401 if remove == "user" else 409), result.text
        async with sessions() as session:
            assert not list(
                (
                    await session.scalars(
                        select(RoundMedia).where(RoundMedia.round_id == recording_round)
                    )
                ).all()
            )
            if remove != "media":
                assert await session.get(Round, recording_round) is None
    finally:
        release.set()
        await asyncio.gather(pending, return_exceptions=True)
        app.dependency_overrides[get_db] = previous


async def test_validate_recording_rejects_truncated_audio_payload(tmp_path):
    path = tmp_path / "recording.part"
    path.write_bytes(wav_bytes(2)[:-4000])
    with pytest.raises(HTTPException) as error:
        await intake.validate_recording(path)
    assert error.value.status_code == 422


async def test_media_process_killed_when_owning_api_process_dies(tmp_path, monkeypatch):
    import signal
    import sys

    executable = tmp_path / "ffmpeg"
    executable.write_text(
        f"#!{sys.executable}\nimport os,time\nprint(os.getpid(),flush=True)\ntime.sleep(60)\n"
    )
    executable.chmod(0o700)
    wrapper = Path(intake.__file__).with_name("media_process.py")
    program = tmp_path / "owner.py"
    program.write_text(
        "import os,subprocess,sys,time\n"
        + f"subprocess.Popen([sys.executable,{str(wrapper)!r},'decode','/unused',str(os.getpid())])\n"
        + "time.sleep(60)\n"
    )
    env = {**os.environ, "PATH": str(tmp_path)}
    # Test process adopts/reaps this owned grandchild after the synthetic API
    # dies, avoiding dependence on the machine PID1's orphan reaping policy.
    import ctypes

    libc = ctypes.CDLL(None)
    assert libc.prctl(36, 1, 0, 0, 0) == 0  # PR_SET_CHILD_SUBREAPER
    owner = await asyncio.create_subprocess_exec(
        sys.executable, str(program), stdout=asyncio.subprocess.PIPE, env=env
    )
    child_pid = None
    try:
        assert owner.stdout is not None
        child_pid = int(await asyncio.wait_for(owner.stdout.readline(), 5))
        owner.kill()
        await owner.wait()
        for _ in range(100):
            pid, status = os.waitpid(child_pid, os.WNOHANG)
            if pid:
                assert os.WIFSIGNALED(status) and os.WTERMSIG(status) == signal.SIGKILL
                break
            await asyncio.sleep(0.02)
        else:
            pytest.fail("Decoder survived owning API death")
    finally:
        if owner.returncode is None:
            owner.kill()
            await owner.wait()
        if child_pid:
            try:
                os.kill(child_pid, signal.SIGKILL)
                os.waitpid(child_pid, 0)
            except (ProcessLookupError, ChildProcessError):
                pass
        assert libc.prctl(36, 0, 0, 0, 0) == 0


async def test_recording_total_timeout_and_cancelled_spool_clean_only_owned_part(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(intake, "UPLOAD_SECONDS", 0.05)

    async def receive():
        await asyncio.sleep(10)
        return {"type": "http.request", "body": b"", "more_body": False}

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/",
            "headers": [(b"content-type", b"multipart/form-data; boundary=recording")],
        },
        receive,
    )
    with intake.intake_slot(tmp_path) as path:
        with pytest.raises(HTTPException) as error:
            await intake.spool_recording(request, path)
        assert error.value.status_code == 408
    assert not path.exists()
    monkeypatch.setattr(intake, "UPLOAD_SECONDS", 10)
    with intake.intake_slot(tmp_path) as path:
        task = asyncio.create_task(intake.spool_recording(request, path))
        await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert not path.exists() and (path.parent / "lock").exists()


def test_cleanup_orphan_uploads_requires_explicit_offline_confirmation(monkeypatch):
    from app.lib.cleanup_orphan_uploads import parse_args

    monkeypatch.setattr("sys.argv", ["cleanup", "--delete"])
    with pytest.raises(SystemExit) as error:
        parse_args()
    assert error.value.code == 2
    monkeypatch.setattr("sys.argv", ["cleanup", "--delete", "--offline"])
    assert parse_args().offline


async def test_intake_slot_two_process_contention_keeps_active_part(tmp_path):
    import sys

    with intake.intake_slot(tmp_path) as path:
        path.write_bytes(b"active owned part")
        code = (
            "from pathlib import Path\nfrom fastapi import HTTPException\nfrom app.services.media_intake import intake_slot\ntry:\n with intake_slot(Path("
            + repr(str(tmp_path))
            + ")): raise AssertionError('second owner acquired slot')\nexcept HTTPException as error: assert error.status_code==503\n"
        )
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-c",
            code,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        output, errors = await asyncio.wait_for(process.communicate(), 10)
        assert process.returncode == 0, (output, errors)
        assert path.read_bytes() == b"active owned part"
    assert not path.exists()


async def test_recording_wrong_scope_rejects_before_streaming(
    client, workspace, recording_round
):
    key = await client.post(
        "/api/settings/api-keys",
        json={
            "label": "synthetic read only",
            "preset": "custom",
            "scopes": ["files:read", "rounds:read"],
        },
    )
    assert key.status_code == 201, key.text
    client.headers.pop("Authorization")
    client.headers["X-API-Key"] = key.json()["api_key"]
    reads = []

    async def body():
        reads.append(True)
        yield multipart(wav_bytes())

    response = await client.post(
        f"/api/rounds/{recording_round}/media",
        content=body(),
        headers={"Content-Type": "multipart/form-data; boundary=recording"},
    )
    assert response.status_code == 403 and not reads


@pytest.mark.parametrize(
    "change",
    ["expiry", "reset", "disabled", "revoked_key", "key_scope", "key_reset", "key_ok"],
)
async def test_recording_admitted_authority_at_publication(
    db_engine, db, client, workspace, recording_round, monkeypatch, change
):
    from datetime import UTC, datetime, timedelta

    from jose import jwt

    from app.core import security
    from app.core.database import get_db
    from app.main import app
    from app.models import User
    from app.models.user_api_key import UserAPIKey

    original = await upload(client, recording_round)
    media = original.json()["media"][0]
    transcript_path = f"/api/rounds/{recording_round}/transcript"
    pasted = await client.put(
        transcript_path,
        json={"text": "retained independent words"},
        headers={"Expected-Transcript-Generation": "0"},
    )
    assert pasted.status_code == 200
    owner_id = workspace[0].id
    key_id = None
    if change in ("revoked_key", "key_scope", "key_reset", "key_ok"):
        key = await client.post(
            "/api/settings/api-keys",
            json={
                "label": "admitted recording",
                "preset": "custom",
                "scopes": ["files:write"],
            },
        )
        assert key.status_code == 201, key.text
        key_id = key.json()["id"]
        client.headers.pop("Authorization")
        client.headers["X-API-Key"] = key.json()["api_key"]
    token = client.headers.get("Authorization", "").removeprefix("Bearer ")
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def independent_db():
        async with sessions() as session:
            yield session

    previous = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = independent_db
    reads = []

    async def body():
        # The actual ASGI body is first consumed only after authentication and
        # files:write admission; mutate authority in a separate committed session.
        reads.append(True)
        if change == "expiry":
            expiry = jwt.get_unverified_claims(token)["exp"]

            class ExpiredClock(datetime):
                @classmethod
                def now(cls, tz=None):
                    return datetime.fromtimestamp(expiry, UTC) + timedelta(seconds=2)

            monkeypatch.setattr(jwt, "datetime", ExpiredClock)
            assert security.decode_token(token) is None
        else:
            async with sessions() as session:
                owner = await session.get(User, owner_id)
                assert owner is not None
                if change in ("reset", "key_reset"):
                    owner.session_version += 1
                elif change == "disabled":
                    owner.is_active = False
                elif change in ("revoked_key", "key_scope"):
                    key = await session.get(UserAPIKey, key_id)
                    assert key is not None
                    if change == "revoked_key":
                        key.revoked_at = datetime.now(UTC)
                    else:
                        key.scopes = ["files:read"]
                await session.commit()
        yield multipart(wav_bytes(2))

    try:
        response = await client.post(
            f"/api/rounds/{recording_round}/media",
            content=body(),
            headers={
                "Content-Type": "multipart/form-data; boundary=recording",
                "Expected-Media-Generation": "1",
                "Replace-Media-Id": media["id"],
            },
        )
        assert reads == [True]
        expected = (
            200
            if change in ("expiry", "key_ok")
            else 403
            if change in ("disabled", "key_scope")
            else 401
        )
        assert response.status_code == expected, response.text
        async with sessions() as session:
            current = await session.get(Round, recording_round)
            sources = list(
                await session.scalars(
                    select(RoundMedia).where(RoundMedia.round_id == recording_round)
                )
            )
            assert current is not None
            assert current.current_transcript == pasted.json()["transcript"]
            assert current.media_generation == (2 if expected == 200 else 1)
            assert len(sources) == 1
            assert (sources[0].id != media["id"]) == (expected == 200)
        from app.api.rounds import settings

        assert (
            Path(settings.upload_dir) / Path(media["file_path"]).name
        ).read_bytes() == wav_bytes()
        assert not list(Path(settings.upload_dir).glob("**/*.part"))
    finally:
        app.dependency_overrides[get_db] = previous


async def test_recording_expired_token_rejected_before_body(
    client, workspace, recording_round
):
    from datetime import UTC, datetime, timedelta

    from jose import jwt

    from app.core.security import settings

    client.headers["Authorization"] = "Bearer " + jwt.encode(
        {
            "sub": workspace[0].id,
            "session_version": workspace[0].session_version,
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(seconds=5),
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    reads = []

    async def body():
        reads.append(True)
        yield multipart(wav_bytes())

    response = await client.post(
        f"/api/rounds/{recording_round}/media",
        content=body(),
        headers={"Content-Type": "multipart/form-data; boundary=recording"},
    )
    assert response.status_code == 401 and not reads
