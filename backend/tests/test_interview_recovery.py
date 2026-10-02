"""Report recovery, retained-data deletion, SQL contention and transfers."""

import asyncio
import json
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_interview_feedback import (
    canned,
    request,
    setup_round,
    text_fixture,
    wait_state,
)

from app.core.deps import AuthContext
from app.models import (
    Application,
    ApplicationStatusHistory,
    InterviewJob,
    Round,
    RoundMedia,
    SystemSettings,
    User,
    UserAPIKey,
)
from app.services import interview_jobs as jobs
from app.services.ai_settings import lock_ai_settings
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import import_payload_data
from app.services.interview_evidence import evidence_sources, snapshot
from app.services.transcription_executor import TranscriptionExecutor


async def prepared(client, db, workspace, monkeypatch, media_source=False):
    from app.main import app

    rid = await setup_round(client, db, workspace, "http://127.0.0.1:9/v1")
    if media_source:
        from app.schemas.transcript import CurrentTranscript

        row = await db.get(Round, rid, populate_existing=True)
        media = RoundMedia(
            round_id=rid,
            file_path="uploads/synthetic-unused.wav",
            media_type="audio",
            sha256="a" * 64,
            byte_count=12,
            probed_duration_seconds=1.0,
            validation="imported_unverified",
        )
        db.add(media)
        await db.flush()
        transcript = {
            **row.current_transcript,
            "source_media_id": media.id,
            "source_hash": media.sha256,
            "provenance": "media",
            "format": "json",
            "coverage": "complete_audio",
            "provider": "synthetic",
            "model": "synthetic",
            "config_revision": str(uuid4()),
            "audio_coverage": [
                {
                    "track": 0,
                    "channel": 0,
                    "index": 0,
                    "start": 0.0,
                    "end": 1.0,
                    "sha256": "a" * 64,
                }
            ],
        }
        row.current_transcript = CurrentTranscript.model_validate(
            transcript
        ).model_dump()
        await db.commit()
    executor = TranscriptionExecutor(
        async_sessionmaker(db.bind, expire_on_commit=False)
    )
    executor.accepting = True
    monkeypatch.setattr(app.state, "transcription_executor", executor, raising=False)
    await request(client, rid)
    job = await db.scalar(select(InterviewJob).where(InterviewJob.round_id == rid))
    job.state, job.claim_id, job.total_sections, job.uncertain = (
        "analyzing",
        str(uuid4()),
        1,
        True,
    )
    data, _ = await snapshot(db, workspace[0].id, rid)
    sources, limits = await evidence_sources(data)
    await db.commit()
    return job, sources, limits


async def retain(db, job, sources, limits):
    await jobs.checkpoint(db, job.id, job.claim_id, 0, canned(sources), sources)
    await db.commit()
    await jobs.publish(db, job.id, job.claim_id, sources, limits)
    await db.commit()


@pytest.mark.parametrize("field", ["skills", "work_history", "correction_note"])
async def test_removed_list_entry_and_history_note_erase_retained_report(
    client, db, workspace, monkeypatch, field
):
    if field == "correction_note":
        entry = await db.scalar(
            select(ApplicationStatusHistory).where(
                ApplicationStatusHistory.application_id == workspace[4]
            )
        )
        entry.correction_note = "PRIVATE REMOVED NOTE"
    else:
        from app.models.user_profile import UserProfile

        before = (
            ["PRIVATE REMOVED A", "B"]
            if field == "skills"
            else [{"company": "PRIVATE REMOVED A"}, {"company": "B"}]
        )
        db.add(UserProfile(user_id=workspace[0].id, **{field: before}))
    await db.commit()
    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    private_source = next(
        source for source in sources if "PRIVATE REMOVED" in source["text"]
    )
    output = canned(sources)
    output["findings"][0]["citations"].append(
        {"source_id": private_source["id"], "quote": private_source["text"][:500]}
    )
    await jobs.checkpoint(db, job.id, job.claim_id, 0, output, sources)
    await db.commit()
    await jobs.publish(db, job.id, job.claim_id, sources, limits)
    await db.commit()
    retained = (
        await client.get(f"/api/rounds/{job.round_id}/interview-feedback")
    ).json()["report"]
    assert "PRIVATE REMOVED" in json.dumps(retained)
    if field == "correction_note":
        revision = (await client.get(f"/api/applications/{workspace[4]}")).json()[
            "evidence_revision"
        ]
        response = await client.patch(
            f"/api/applications/{workspace[4]}/history/{entry.id}",
            json={
                "expected_revision": revision,
                "correction_note": None,
                "to_meaning": "interviewing",
            },
        )
    else:
        response = await client.put("/api/profile", json={field: before[1:]})
    assert response.status_code == 200, response.text
    state = (await client.get(f"/api/rounds/{job.round_id}/interview-feedback")).json()
    assert state["report"] is None and "source-removed" in state["stale_reason"]
    await db.refresh(job)
    assert job.checkpoints == [] and job.manifest == {}


@pytest.mark.parametrize("late", [False, True])
async def test_original_media_dependency_survives_independent_paste(
    client, db, workspace, monkeypatch, late
):
    job, sources, limits = await prepared(
        client, db, workspace, monkeypatch, media_source=True
    )
    media = await db.get(RoundMedia, job.manifest["source_media_id"])
    assert media is not None
    if not late:
        await retain(db, job, sources, limits)
    response = await client.put(
        f"/api/rounds/{job.round_id}/transcript",
        headers={"Expected-Transcript-Generation": "2"},
        json={"text": "Independent pasted material stays", "format": "txt"},
    )
    assert response.status_code == 200, response.text
    if not late:
        stale = (
            await client.get(f"/api/rounds/{job.round_id}/interview-feedback")
        ).json()
        assert stale["stale_reason"] and stale["report"]["source_media_id"] == media.id
        assert "We worked together" in json.dumps(stale["report"])
    response = await client.delete(
        f"/api/media/{media.id}", headers={"Expected-Media-Generation": "0"}
    )
    assert response.status_code == 204, response.text
    if late:
        with pytest.raises(HTTPException):
            await jobs.checkpoint(db, job.id, job.claim_id, 0, canned(sources), sources)
        await db.rollback()
        await db.refresh(job)
    state = (await client.get(f"/api/rounds/{job.round_id}/interview-feedback")).json()
    assert state["report"] is None
    transcript = (await client.get(f"/api/rounds/{job.round_id}/transcript")).json()
    assert (
        transcript["transcript"]["segments"][0]["text"]
        == "Independent pasted material stays"
    )


@pytest.mark.parametrize("boundary", ["checkpoint", "final"])
@pytest.mark.parametrize(
    "mutation",
    ["delete", "edit", "profile", "config", "session", "disabled", "key", "scopes"],
)
async def test_competing_sql_writer_blocks_and_discards_late_text(
    client, db, workspace, monkeypatch, boundary, mutation
):
    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    jid, rid, uid, claim = job.id, job.round_id, job.user_id, job.claim_id
    key = UserAPIKey(
        user_id=uid,
        label="synthetic",
        key_prefix="test",
        key_hash=str(uuid4()),
        scopes=jobs.SCOPES,
    )
    db.add(key)
    await db.flush()
    job.api_key_id = key.id
    await db.commit()
    if boundary == "final":
        await jobs.checkpoint(db, jid, claim, 0, canned(sources), sources)
        await db.commit()
    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    async with sessions() as writer:
        if mutation in ("session", "disabled"):
            await writer.execute(
                update(User)
                .where(User.id == uid)
                .values(
                    **(
                        {"session_version": User.session_version + 1}
                        if mutation == "session"
                        else {"is_active": False}
                    )
                )
            )
        elif mutation in ("key", "scopes"):
            await writer.execute(
                update(UserAPIKey)
                .where(UserAPIKey.id == key.id)
                .values(
                    **(
                        {"revoked_at": datetime.now(UTC)}
                        if mutation == "key"
                        else {"scopes": ["analytics:read"]}
                    )
                )
            )
        else:
            await lock_ai_settings(writer)
            if mutation == "config":
                await writer.execute(
                    update(SystemSettings)
                    .where(SystemSettings.key == "text_revision")
                    .values(value=str(uuid4()))
                )
            elif mutation == "delete":
                await writer.execute(delete(Round).where(Round.id == rid))
            elif mutation == "profile":
                await jobs.invalidate_interviews(writer, user_id=uid, removed=True)
            else:
                await writer.execute(
                    update(Round)
                    .where(Round.id == rid)
                    .values(notes_summary="Concurrent edit")
                )
                await jobs.invalidate_interviews(writer, round_id=rid)
        entered = asyncio.Event()

        async def late_write():
            async with sessions() as session:
                entered.set()
                try:
                    if boundary == "checkpoint":
                        await jobs.checkpoint(
                            session, jid, claim, 0, canned(sources), sources
                        )
                    else:
                        await jobs.publish(session, jid, claim, sources, limits)
                    await session.commit()
                    return "published"
                except HTTPException:
                    await session.rollback()
                    return "discarded"

        task = asyncio.create_task(late_write())
        await entered.wait()
        await asyncio.sleep(0.1)
        assert not task.done(), "Retention bypassed a competing uncommitted SQL write"
        await writer.commit()
        assert await asyncio.wait_for(task, 10) == "discarded"
    await db.rollback()
    current = await db.get(Round, rid, populate_existing=True)
    assert current is None or current.interview_report is None


async def test_chunked_json_rejected_before_full_read_and_validation_sanitized(
    client, workspace
):
    path = f"/api/applications/{workspace[4]}/documents/cv/text"
    consumed = 0

    async def huge():
        nonlocal consumed
        for _ in range(100):
            consumed += 1
            yield b"x" * 65536

    response = await client.put(
        path, content=huge(), headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413 and consumed == 4
    response = await client.put(
        path, json={"text": "PRIVATE-INPUT", "expected_revision": "PRIVATE-INVALID"}
    )
    assert response.status_code == 422 and "PRIVATE" not in response.text


async def test_supported_report_archive_roundtrip_and_malformed_preflight(
    client, db, workspace, monkeypatch
):
    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    await retain(db, job, sources, limits)
    application = await db.get(Application, workspace[4])
    application.cv_text = "Persisted fallback"
    await db.commit()
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[0].id, session
        )
    )
    original = deepcopy(archive["models"]["Round"][0]["interview_report"])
    for malformed in (
        ["x"],
        {
            **original,
            "sources": [{**original["sources"][0], "id": "transcript:foreign:0"}],
        },
    ):
        bad = deepcopy(archive)
        bad["models"]["Round"][0]["interview_report"] = malformed
        with pytest.raises(ValueError, match="Invalid"):
            await import_payload_data(db, workspace[1].id, bad, {}, lambda **kw: None)
        await db.rollback()
        await db.refresh(workspace[1])
        await db.refresh(job)
    await import_payload_data(db, workspace[1].id, archive, {}, lambda **kw: None)
    await db.commit()
    restored = await db.scalar(
        select(Round).join(Application).where(Application.user_id == workspace[1].id)
    )
    assert (
        restored.interview_generation == 0
        and "Imported" in restored.interview_report_reason
    )
    assert restored.interview_report["round_id"] == restored.id != job.round_id
    assert restored.current_transcript["segments"][0]["id"] in {
        s.get("segment_id") for s in restored.interview_report["sources"]
    }
    assert (
        await db.get(Application, restored.application_id)
    ).cv_text == "Persisted fallback"
    assert not await db.scalar(
        select(InterviewJob.id).where(InterviewJob.user_id == workspace[1].id)
    )
    assert (
        restored.interview_report["findings"][0]["observation"]
        == original["findings"][0]["observation"]
    )


async def test_archive_replaced_passage_is_preflight_only(
    client, db, workspace, monkeypatch
):
    """Reject citations to replaced transcript passages before changing records."""
    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    await retain(db, job, sources, limits)
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[0].id, session
        )
    )
    from app.models.user_profile import UserProfile

    db.add(UserProfile(user_id=workspace[1].id, skills=["Recipient must stay"]))
    await db.commit()
    await db.refresh(workspace[1])
    before = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[1].id, session
        )
    )
    bad = deepcopy(archive)
    bad["models"]["Round"][0]["current_transcript"]["segments"][0]["id"] = str(uuid4())
    with pytest.raises(ValueError, match="replaced transcript passage"):
        await import_payload_data(db, workspace[1].id, bad, {}, lambda **kw: None)
    await db.rollback()
    await db.refresh(workspace[1])
    after = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[1].id, session
        )
    )
    assert after["models"] == before["models"]


async def test_profile_cited_report_roundtrips_after_profile_restore(
    client, db, workspace, monkeypatch
):
    """Validate profile citations against the profile restored from the archive."""
    from app.models.user_profile import UserProfile

    db.add(
        UserProfile(
            user_id=workspace[0].id,
            skills=["Portable Python"],
            work_history=[{"company": "Archive Co", "title": "Engineer"}],
        )
    )
    await db.commit()
    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    output = canned(sources)
    profile_source = next(s for s in sources if s["kind"] == "profile")
    output["findings"][0]["citations"].append(
        {"source_id": profile_source["id"], "quote": profile_source["text"][:500]}
    )
    await jobs.checkpoint(db, job.id, job.claim_id, 0, output, sources)
    await db.commit()
    await jobs.publish(db, job.id, job.claim_id, sources, limits)
    await db.commit()
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[0].id, session
        )
    )
    report = archive["models"]["Round"][0]["interview_report"]
    assert any(s["kind"] == "profile" for s in report["sources"])
    await import_payload_data(db, workspace[1].id, archive, {}, lambda **kw: None)
    await db.commit()
    restored_profile = await db.scalar(
        select(UserProfile).where(UserProfile.user_id == workspace[1].id)
    )
    assert restored_profile.skills == ["Portable Python"]
    restored = await db.scalar(
        select(Round).join(Application).where(Application.user_id == workspace[1].id)
    )
    assert restored.interview_report is not None
    assert "unverified" in restored.interview_report_reason
    # Profile citations are owner-relative and need no identity remap.
    for source in restored.interview_report["sources"]:
        if source["kind"] == "profile":
            assert source["id"].startswith("profile:")


async def test_long_sections_cover_all_passages_and_interrupted_restart_does_not_replay(
    client, db, workspace, tmp_path, monkeypatch
):
    from app.main import app

    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    async with text_fixture() as (endpoint, calls):
        rid = await setup_round(client, db, workspace, endpoint)
        transcript = (await client.get(f"/api/rounds/{rid}/transcript")).json()[
            "transcript"
        ]
        transcript["segments"][0]["text"] = "Long assigned answer. " * 2800
        response = await client.patch(
            f"/api/rounds/{rid}/transcript",
            headers={"Expected-Transcript-Generation": "2"},
            json={"segments": transcript["segments"]},
        )
        assert response.status_code == 200, response.text
        executor = TranscriptionExecutor(sessions, tmp_path)
        monkeypatch.setattr(
            app.state, "transcription_executor", executor, raising=False
        )
        async with executor.lifespan():
            await request(client, rid)
            assert await wait_state(sessions, rid) == "complete"
        assert len(calls) >= 3
        sent = [
            s
            for _, body in calls
            for s in json.loads(body["messages"][1]["content"])["sources"]
        ]
        actual = [s for s in sent if s["kind"] == "transcript"]
        assert sum(len(s["text"]) for s in actual) == sum(
            len(s["text"]) for s in transcript["segments"]
        )
        job = await db.scalar(select(InterviewJob).where(InterviewJob.round_id == rid))
        job.state, job.uncertain = "analyzing", True
        await db.commit()
        async with executor.lifespan():
            await asyncio.sleep(0.3)
        await db.refresh(job)
        assert job.state == "interrupted" and not job.checkpoints and len(calls) >= 3
        count = len(calls)
        async with executor.lifespan():
            await asyncio.sleep(0.3)
        assert len(calls) == count
        state = await jobs.read(db, AuthContext(workspace[0], "jwt"), rid)
        assert state["report"] and state["job"]["uncertain"]


async def test_interview_api_dedup_shared_admission_and_input_scopes(
    client, db, workspace, monkeypatch
):
    from app.core.security import hash_api_key
    from app.schemas.interview_feedback import InterviewRequest
    from app.services.transcription_jobs import MAX_QUEUE

    job, sources, limits = await prepared(
        client, db, workspace, monkeypatch, media_source=True
    )
    path = f"/api/rounds/{job.round_id}/interview-feedback"
    body = {
        "intent_id": job.intent_id,
        "generation": job.generation,
        "config_revision": job.config_revision,
    }
    response = await client.post(path, json=body)
    assert response.status_code == 202 and response.json()["id"] == job.id
    raw = "synthetic-interview-scoped-key"
    key = UserAPIKey(
        user_id=workspace[0].id,
        label="synthetic",
        key_prefix="test",
        key_hash=hash_api_key(raw),
        scopes=jobs.SCOPES,
    )
    db.add(key)
    await db.commit()
    bearer = client.headers.pop("Authorization")
    client.headers["X-API-Key"] = raw
    for missing in ("files:read", "profile:read", "rounds:read", "applications:read"):
        key.scopes = [s for s in jobs.SCOPES if s != missing]
        await db.commit()
        assert (await client.get(path)).status_code == 403
        assert (await client.post(path, json=body)).status_code == 403
    key.scopes = jobs.READ_SCOPES
    await db.commit()
    assert (await client.get(path)).status_code == 200
    assert (await client.post(path, json=body)).status_code == 403
    client.headers.pop("X-API-Key")
    client.headers["Authorization"] = bearer
    other_round = Round(application_id=workspace[4], round_type_id=workspace[3][0].id)
    db.add(other_round)
    from app.models import ProcessingJob

    db.add(
        ProcessingJob(
            user_id=job.user_id,
            round_id=job.round_id,
            media_id=job.manifest["source_media_id"],
            intent_id=str(uuid4()),
            source_path="uploads/synthetic-unused.wav",
            source_hash="a" * 64,
            media_generation=0,
            transcript_generation=2,
            config_revision=job.config_revision,
            provider="synthetic",
            model="synthetic",
            session_version=job.session_version,
            required_scopes=[],
        )
    )
    for _ in range(MAX_QUEUE - 2):
        db.add(
            InterviewJob(
                user_id=job.user_id,
                round_id=job.round_id,
                intent_id=str(uuid4()),
                generation=job.generation,
                fingerprint=job.fingerprint,
                manifest={},
                config_revision=job.config_revision,
                provider=job.provider,
                model=job.model,
                session_version=job.session_version,
                required_scopes=jobs.SCOPES,
            )
        )
    await db.commit()
    assert await jobs.queue_count(db) == MAX_QUEUE
    with pytest.raises(HTTPException) as exc:
        await jobs.start(
            db,
            AuthContext(workspace[0], "jwt"),
            "INTERVIEW",
            InterviewRequest(
                intent_id=uuid4(), generation=0, config_revision=job.config_revision
            ),
            round_id=other_round.id,
        )
    assert exc.value.status_code == 503
    await db.rollback()


async def test_api_edit_waits_for_atomic_final_and_removes_report(
    client, db, workspace, monkeypatch
):
    from app.core.database import get_db
    from app.main import app

    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    await jobs.checkpoint(db, job.id, job.claim_id, 0, canned(sources), sources)
    await db.commit()
    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    original = app.dependency_overrides[get_db]

    async def independent_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = independent_db
    try:
        async with sessions() as publisher:
            await jobs.publish(publisher, job.id, job.claim_id, sources, limits)
            task = asyncio.create_task(
                client.delete(
                    f"/api/rounds/{job.round_id}/transcript",
                    headers={"Expected-Transcript-Generation": "2"},
                )
            )
            await asyncio.sleep(0.1)
            assert not task.done(), (
                "Source deletion bypassed retained-report transaction"
            )
            await publisher.commit()
            response = await asyncio.wait_for(task, 10)
            assert response.status_code == 204, response.text
        async with sessions() as check:
            row = await check.get(Round, job.round_id)
            assert row is not None
            assert row.interview_report is None and row.current_transcript is None
    finally:
        app.dependency_overrides[get_db] = original


async def test_unavailable_parser_is_safe(monkeypatch):
    from app.services import interview_evidence

    async def unavailable(*args):
        raise HTTPException(503, "Parser absent")

    monkeypatch.setattr(interview_evidence, "run_media_process", unavailable)
    text, reason = await interview_evidence.document_text(
        {
            "paste": None,
            "availability": "present",
            "path": "uploads/absent.pdf",
            "filename": "absent.pdf",
        }
    )
    assert not text and "parser absent" in reason and "no OCR" in reason


@pytest.mark.parametrize("case", ["hostile", "unknown", "partial"])
async def test_actual_http_invalid_or_partial_output_never_claims_complete(
    client, db, workspace, tmp_path, monkeypatch, case
):
    from app.main import app

    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    async with text_fixture(
        hostile=case == "hostile", fail_after=1 if case == "partial" else None
    ) as (endpoint, calls):
        rid = await setup_round(client, db, workspace, endpoint)
        if case in ("unknown", "partial"):
            transcript = (await client.get(f"/api/rounds/{rid}/transcript")).json()[
                "transcript"
            ]
            if case == "unknown":
                transcript["segments"][0]["role"] = "unknown"
            else:
                transcript["segments"][0]["text"] = "Long answer " * 5000
            response = await client.patch(
                f"/api/rounds/{rid}/transcript",
                headers={"Expected-Transcript-Generation": "2"},
                json={"segments": transcript["segments"]},
            )
            assert response.status_code == 200
        executor = TranscriptionExecutor(sessions, tmp_path)
        monkeypatch.setattr(
            app.state, "transcription_executor", executor, raising=False
        )
        async with executor.lifespan():
            await request(client, rid)
            assert await wait_state(sessions, rid) == (
                "complete" if case == "unknown" else "failed"
            )
            state = (await client.get(f"/api/rounds/{rid}/interview-feedback")).json()
            if case == "unknown":
                assert (
                    state["report"]["findings"] == [] and state["report"]["limitations"]
                )
            else:
                assert (
                    state["report"] is None and state["job"]["completed_sections"] == 0
                )
            assert len(calls) == (2 if case == "partial" else 1)


async def test_document_resource_bounds_and_hostile_docx(tmp_path):
    import zipfile
    from pathlib import Path

    from app.core.config import get_settings
    from app.services.interview_evidence import document_text

    root = Path(get_settings().upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    too_long = root / "interview-too-long.txt"
    too_long.write_text("x" * 32001)
    for filename, xml in [
        (
            "entity.docx",
            b'<!DOCTYPE document [<!ENTITY x SYSTEM "file:///etc/passwd">]><document>&x;</document>',
        ),
        ("expanded.docx", b"x" * 2_000_001),
    ]:
        with zipfile.ZipFile(
            root / filename, "w", compression=zipfile.ZIP_DEFLATED
        ) as archive:
            archive.writestr("word/document.xml", xml)
    for filename in ("interview-too-long.txt", "entity.docx", "expanded.docx"):
        text, reason = await document_text(
            {
                "paste": None,
                "availability": "present",
                "path": str(root / filename),
                "filename": filename,
            }
        )
        assert text == "" and "no OCR" in reason


async def test_queued_interview_restart_does_not_dispatch(
    client, db, workspace, tmp_path, monkeypatch
):
    job, _, _ = await prepared(client, db, workspace, monkeypatch)
    job.state, job.claim_id, job.uncertain = "queued", None, False
    await db.commit()
    executor = TranscriptionExecutor(
        async_sessionmaker(db.bind, expire_on_commit=False), tmp_path
    )
    async with executor.lifespan():
        await asyncio.sleep(0.3)
    await db.refresh(job)
    assert job.state == "interrupted" and not job.uncertain and not job.checkpoints


async def test_irrelevant_owner_changes_leave_feedback_fresh_and_file_replacement_erases(
    client, db, workspace, monkeypatch
):
    from app.core.security import create_access_token

    application = await db.get(Application, workspace[4])
    assert application is not None
    application.cv_text = "Original synthetic CV"
    await db.commit()
    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    await retain(db, job, sources, limits)
    path = f"/api/rounds/{job.round_id}/interview-feedback"
    state = (await client.get(path)).json()
    token = client.headers["Authorization"]
    client.headers["Authorization"] = "Bearer " + create_access_token(
        {"sub": workspace[1].id, "session_version": workspace[1].session_version}
    )
    assert (await client.get(path)).status_code == 404
    assert (
        await client.put("/api/profile", json={"skills": ["Other owner's skill"]})
    ).status_code == 200
    client.headers["Authorization"] = token
    assert (
        await client.put("/api/profile", json={"phone": "+15550001234"})
    ).status_code == 200
    after = (await client.get(path)).json()
    assert after["stale_reason"] is None and after["report"] == state["report"]
    response = await client.post(
        f"/api/applications/{workspace[4]}/cv",
        files={"file": ("replacement.txt", b"Replacement synthetic CV", "text/plain")},
    )
    assert response.status_code == 200, response.text
    assert (await client.get(path)).json()["report"] is None


async def test_archive_remaps_document_history_round_and_original_media(
    client, db, workspace, monkeypatch
):
    application = await db.get(Application, workspace[4])
    application.cv_text = "Known synthetic CV experience"
    await db.commit()
    job, sources, limits = await prepared(
        client, db, workspace, monkeypatch, media_source=True
    )
    output = canned(sources)
    for kind in ("cv", "history", "round"):
        source = next(s for s in sources if s["kind"] == kind)
        output["findings"][0]["citations"].append(
            {"source_id": source["id"], "quote": source["text"][:500]}
        )
    await jobs.checkpoint(db, job.id, job.claim_id, 0, output, sources)
    await db.commit()
    await jobs.publish(db, job.id, job.claim_id, sources, limits)
    await db.commit()
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            workspace[0].id, session
        )
    )
    media_row = archive["models"]["RoundMedia"][0]
    await import_payload_data(
        db,
        workspace[1].id,
        archive,
        {media_row["file_path"]: media_row["file_path"]},
        lambda **kw: None,
    )
    await db.commit()
    restored = await db.scalar(
        select(Round).join(Application).where(Application.user_id == workspace[1].id)
    )
    report = restored.interview_report
    media = await db.get(RoundMedia, report["source_media_id"])
    assert media.round_id == restored.id and media.id != media_row["id"]
    assert restored.current_transcript["source_media_id"] == media.id
    for source in report["sources"]:
        parts = source["id"].split(":")
        if source["kind"] == "cv":
            assert parts[1] == restored.application_id
        elif source["kind"] == "round":
            assert parts[1] == restored.id
        elif source["kind"] == "history":
            assert (
                await db.get(ApplicationStatusHistory, parts[1])
            ).application_id == restored.application_id
    assert {c["source_id"] for c in report["findings"][0]["citations"]} == {
        s["id"] for s in report["sources"]
    }
