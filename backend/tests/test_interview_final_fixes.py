"""Final review regressions: archived provenance, admitted paste authority and Unicode."""

import asyncio
import json
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_interview_recovery import prepared, retain

from app.core.security import create_access_token, hash_api_key
from app.models import Application, Round, RoundMedia, User, UserAPIKey
from app.services.ai_settings import lock_ai_settings
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import import_payload_data


async def export(db, uid):
    return await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(uid, session)
    )


@pytest.mark.parametrize("dependency", ["null", "omitted", "wrong-same-round"])
async def test_archive_rejects_lost_cited_media_dependency_before_mutation(
    client, db, workspace, monkeypatch, dependency
):
    uid, recipient = workspace[0].id, workspace[1].id
    job, sources, limits = await prepared(
        client, db, workspace, monkeypatch, media_source=True
    )
    await retain(db, job, sources, limits)
    archive = await export(db, uid)
    media = archive["models"]["RoundMedia"][0]
    mapping = {media["file_path"]: media["file_path"]}
    await import_payload_data(db, recipient, archive, mapping, lambda **kw: None)
    await db.commit()
    before = await export(db, recipient)
    bad = deepcopy(archive)
    report = bad["models"]["Round"][0]["interview_report"]
    if dependency == "omitted":
        report.pop("source_media_id")
    elif dependency == "null":
        report["source_media_id"] = None
    else:
        other = {**media, "id": str(uuid4())}
        other["__original_id__"] = other["id"]
        bad["models"]["RoundMedia"].append(other)
        report["source_media_id"] = other["id"]
    with pytest.raises(ValueError, match="Invalid"):
        await import_payload_data(db, recipient, bad, mapping, lambda **kw: None)
    # Check before rollback: rejection must not need rollback to preserve data.
    assert (await export(db, recipient))["models"] == before["models"]
    assert (await export(db, uid))["models"] == archive["models"]


@pytest.mark.parametrize("media_source", [False, True])
async def test_imported_report_dependency_and_independent_paste_deletion(
    client, db, workspace, monkeypatch, media_source
):
    recipient = workspace[1].id
    token = create_access_token(
        {"sub": recipient, "session_version": workspace[1].session_version}
    )
    job, sources, limits = await prepared(
        client, db, workspace, monkeypatch, media_source=media_source
    )
    if not media_source:
        # Same-round ownership alone does not make independently pasted speech media-derived.
        db.add(
            RoundMedia(
                round_id=job.round_id,
                file_path="uploads/unrelated-synthetic.wav",
                media_type="audio",
                sha256="b" * 64,
                byte_count=12,
                probed_duration_seconds=1.0,
                validation="imported_unverified",
            )
        )
        await db.commit()
    await retain(db, job, sources, limits)
    archive = await export(db, workspace[0].id)
    mapping = {
        m["file_path"]: m["file_path"] for m in archive["models"].get("RoundMedia", [])
    }
    if not media_source:
        archive["models"]["Round"][0]["interview_report"].pop("source_media_id")
    await import_payload_data(db, recipient, archive, mapping, lambda **kw: None)
    await db.commit()
    restored = await db.scalar(
        select(Round).join(Application).where(Application.user_id == recipient)
    )
    rid = restored.id
    media_id = restored.interview_report["source_media_id"]
    assert "We worked together" in json.dumps(restored.interview_report)
    assert media_id == restored.current_transcript.get("source_media_id")
    assert bool(media_id) == media_source
    client.headers["Authorization"] = "Bearer " + token
    response = await client.put(
        f"/api/rounds/{rid}/transcript",
        headers={"Expected-Transcript-Generation": str(restored.transcript_generation)},
        json={"text": "Independent paste remains", "format": "txt"},
    )
    assert response.status_code == 200, response.text
    state = (await client.get(f"/api/rounds/{rid}/interview-feedback")).json()
    assert "We worked together" in json.dumps(state["report"])
    if media_source:
        response = await client.delete(
            f"/api/media/{media_id}",
            headers={"Expected-Media-Generation": str(restored.media_generation)},
        )
        assert response.status_code == 204, response.text
        state = (await client.get(f"/api/rounds/{rid}/interview-feedback")).json()
        assert state["report"] is None
    transcript = (await client.get(f"/api/rounds/{rid}/transcript")).json()
    assert (
        transcript["transcript"]["segments"][0]["text"] == "Independent paste remains"
    )


@pytest.mark.parametrize(
    "mutation",
    [
        "revoked",
        "applications:read",
        "files:read",
        "files:write",
        "session",
        "disabled",
        "expired-jwt",
        "unchanged-key",
    ],
)
async def test_document_paste_rechecks_admitted_authority_after_held_write_boundary(
    client, db, workspace, monkeypatch, mutation
):
    from app.api import interview_feedback
    from app.core import deps
    from app.core.database import get_db
    from app.main import app

    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    await retain(db, job, sources, limits)
    uid, aid, rid = workspace[0].id, workspace[4], job.round_id
    application = await db.get(Application, aid)
    application.cv_text = "Keep saved fallback"
    scopes = ["applications:read", "files:read", "files:write"]
    raw = "synthetic-" + uuid4().hex
    key = UserAPIKey(
        user_id=uid,
        label="synthetic",
        key_prefix="test",
        key_hash=hash_api_key(raw),
        scopes=scopes,
    )
    db.add(key)
    await db.commit()
    kid, revision = key.id, application.evidence_revision
    # Compare database-loaded timestamps on SQLite, not pre-commit aware ORM values.
    db.expire_all()
    before = (await export(db, uid))["models"]
    await db.rollback()
    if mutation not in ("session", "disabled", "expired-jwt"):
        client.headers.pop("Authorization")
        client.headers["X-API-Key"] = raw
    sessions = async_sessionmaker(db.bind, expire_on_commit=False)

    async def request_db():
        async with sessions() as session:
            yield session

    monkeypatch.setitem(app.dependency_overrides, get_db, request_db)
    admitted, proceed, attempting = asyncio.Event(), asyncio.Event(), asyncio.Event()

    async def held_boundary(session):
        # Handler reached only after real router authentication/scope admission.
        admitted.set()
        await proceed.wait()
        attempting.set()
        return await lock_ai_settings(session)

    monkeypatch.setattr(interview_feedback, "lock_ai_settings", held_boundary)
    task = asyncio.create_task(
        client.put(
            f"/api/applications/{aid}/documents/cv/text",
            json={
                "text": "Must not write after revocation",
                "expected_revision": revision,
            },
        )
    )
    try:
        await asyncio.wait_for(admitted.wait(), 10)
        async with sessions() as writer:
            await lock_ai_settings(writer)
            if mutation in scopes or mutation == "revoked":
                await writer.execute(
                    update(UserAPIKey)
                    .where(UserAPIKey.id == kid)
                    .values(
                        **(
                            {"revoked_at": datetime.now(UTC)}
                            if mutation == "revoked"
                            else {"scopes": [s for s in scopes if s != mutation]}
                        )
                    )
                )
            elif mutation in ("session", "disabled"):
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
            elif mutation == "expired-jwt":
                # Expiry after admission alone is not deliberate revocation.
                monkeypatch.setattr(deps, "decode_token", lambda value: None)
            proceed.set()
            await asyncio.wait_for(attempting.wait(), 10)
            await asyncio.sleep(0.1)
            assert not task.done(), "Paste bypassed the held SQL write boundary"
            await writer.commit()
        response = await asyncio.wait_for(task, 10)
    finally:
        proceed.set()
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    if mutation in ("expired-jwt", "unchanged-key"):
        assert response.status_code == 200, response.text
        assert (await db.get(Application, aid, populate_existing=True)).cv_text == (
            "Must not write after revocation"
        )
        assert (
            await db.get(Round, rid, populate_existing=True)
        ).interview_report is None
        return
    assert response.status_code in (401, 403), response.text
    after = (await export(db, uid))["models"]
    for model in ("Application", "Round", "InterviewJob"):
        assert after.get(model) == before.get(model), (model, rid)


@pytest.mark.parametrize("kind", ["cv", "cover_letter"])
async def test_document_text_escaped_surrogate_rejected_without_mutation(
    client, db, workspace, monkeypatch, kind
):
    job, sources, limits = await prepared(client, db, workspace, monkeypatch)
    await retain(db, job, sources, limits)
    uid, recipient, aid = workspace[0].id, workspace[1].id, workspace[4]
    application = await db.get(Application, aid)
    setattr(application, kind + "_text", "Keep private fallback")
    await db.commit()
    revision = application.evidence_revision
    archive = await export(db, uid)
    await import_payload_data(db, recipient, archive, {}, lambda **kw: None)
    await db.commit()
    recipient_before = (await export(db, recipient))["models"]
    # Escaped JSON bytes, not an unencodable source literal or httpx json encoder.
    body = (
        b'{"text":"PRIVATE-\\ud800","expected_revision":'
        + str(revision).encode()
        + b"}"
    )
    response = await client.put(
        f"/api/applications/{aid}/documents/{kind}/text",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422 and "PRIVATE" not in response.text
    assert (await export(db, uid))["models"] == archive["models"]
    bad = deepcopy(archive)
    bad["models"]["Application"][0][kind + "_text"] = json.loads(body)["text"]
    with pytest.raises(ValueError, match="Invalid") as error:
        await import_payload_data(db, recipient, bad, {}, lambda **kw: None)
    assert "PRIVATE" not in str(error.value)
    assert (await export(db, recipient))["models"] == recipient_before
    assert (await export(db, uid))["models"] == archive["models"]


def test_shared_document_text_validation_rejects_escaped_surrogates_and_bounds():
    from app.schemas.interview_feedback import DocumentTextPaste, validate_document_text

    for encoded in (r'"\ud800"', r'"\udfff"', r'"\u0000"'):
        invalid = json.loads(encoded)
        with pytest.raises(ValueError):
            validate_document_text(invalid)
        with pytest.raises(ValueError):
            DocumentTextPaste(text=invalid, expected_revision=0)
    with pytest.raises(ValueError):
        validate_document_text("a" * 32001)
    for valid in ("", "a" * 32000, json.loads(r'"R\u00e9sum\u00e9 \ud83d\ude00"')):
        assert validate_document_text(valid) == valid
        assert DocumentTextPaste(text=valid, expected_revision=0).text == valid
