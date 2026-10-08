"""One SQL transcription queue; all retained text crosses the same write boundary."""

from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthContext, check_api_key_scope, recheck_admitted_auth
from app.models import Application, ProcessingJob, Round, RoundMedia, User, UserAPIKey
from app.schemas.transcript import MAX_SEGMENTS, CurrentTranscript, TranscriptSegment
from app.services.ai_settings import get_ai_settings, lock_ai_settings
from app.services.interview_text import supported
from app.services.speech_openai import SpeechResult

SCOPES = ["rounds:read", "files:read", "files:write"]
ACTIVE = ("queued", "preparing", "transcribing")
MAX_QUEUE = 16

NO_SPEECH_ERROR = (
    "No speech detected; no transcript was produced. Any existing transcript was kept. "
    "Verify the recording has audible English speech."
)


class NoSpeechDetected(ValueError):
    """No speech text was produced; a good existing transcript is preserved."""


async def invalidate_round_jobs(db: AsyncSession, round_id: str):
    # Caller already owns the round write lock; deletion and text removal commit
    # together. Never keep hidden text in terminal jobs after destination mutation.
    await db.execute(
        update(ProcessingJob)
        .where(ProcessingJob.round_id == round_id)
        .values(
            state="invalidated",
            stage="invalidated",
            checkpoints=[],
            coverage=[],
            claim_id=None,
            result_id=None,
            error="Source or transcript changed; start a new request",
        )
    )


async def lock_authority(
    db: AsyncSession, user_id: str, version: int, key_id: str | None
):
    # No-op UPDATE locks actual authority rows on PostgreSQL and obtains SQLite's
    # writer lock. Revocation cannot commit between recheck and retained-text write.
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(session_version=User.session_version)
    )
    if key_id:
        await db.execute(
            update(UserAPIKey)
            .where(UserAPIKey.id == key_id)
            .values(revoked_at=UserAPIKey.revoked_at)
        )
    auth = await recheck_admitted_auth(db, user_id, version, key_id)
    for scope in SCOPES:
        check_api_key_scope(auth, scope)
    return auth


async def guard_job(db: AsyncSession, job_id: str, claim_id: str | None, states=ACTIVE):
    # Fixed lock order: settings, authority, round, job. Every read of guarded
    # state follows a real write lock; READ COMMITTED is sufficient on PostgreSQL.
    await lock_ai_settings(db)
    job = await db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.id == job_id)
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise HTTPException(409, "Transcription source was removed")
    await lock_authority(db, job.user_id, job.session_version, job.api_key_id)
    result = await db.execute(
        update(Round)
        .where(
            Round.id == job.round_id,
            Round.media_generation == job.media_generation,
            Round.transcript_generation == job.transcript_generation,
            Round.application_id.in_(
                select(Application.id).where(Application.user_id == job.user_id)
            ),
        )
        .values(media_generation=Round.media_generation)
        .returning(Round.id)
        .execution_options(synchronize_session=False)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(409, "Source or destination changed")
    job = await db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None or job.claim_id != claim_id or job.state not in states:
        raise HTTPException(409, "Transcription claim is no longer current")
    media = await db.scalar(
        select(RoundMedia)
        .where(RoundMedia.id == job.media_id, RoundMedia.round_id == job.round_id)
        .execution_options(populate_existing=True)
    )
    speech = (await get_ai_settings(db)).speech
    if (
        media is None
        or media.file_path != job.source_path
        or media.sha256 != job.source_hash
        or speech.revision != job.config_revision
        or not speech.disclosure().available
    ):
        raise HTTPException(409, "Source or speech configuration changed")
    if job.required_scopes != SCOPES:
        raise HTTPException(403, "Unsupported transcription authority")
    return job, media, speech


async def start_job(
    db: AsyncSession,
    auth: AuthContext,
    round_id: str,
    media_id: str,
    intent_id: str,
    generation: int,
    config_revision: str,
):
    await lock_ai_settings(db)
    await lock_authority(
        db,
        auth.user.id,
        auth.user.session_version,
        auth.api_key.id if auth.api_key else None,
    )
    old = await db.scalar(
        select(ProcessingJob).where(
            ProcessingJob.user_id == auth.user.id, ProcessingJob.intent_id == intent_id
        )
    )
    if old:
        if old.round_id != round_id or old.media_id != media_id:
            raise HTTPException(
                409, "Request intent already belongs to another recording"
            )
        return old
    round = await db.scalar(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == auth.user.id)
    )
    if round is None:
        raise HTTPException(404, "Round not found")
    # Round UPDATE serializes admission against deletion and manual changes.
    locked = await db.scalar(
        update(Round)
        .where(Round.id == round_id, Round.transcript_generation == generation)
        .values(media_generation=Round.media_generation)
        .returning(Round.id)
    )
    if locked is None:
        raise HTTPException(
            409, "Transcript changed; reload before requesting replacement"
        )
    await db.refresh(round)
    speech = (await get_ai_settings(db)).speech
    if not speech.disclosure().available:
        raise HTTPException(503, speech.disclosure().message)
    if speech.revision != config_revision:
        raise HTTPException(
            409, "Speech configuration changed; review disclosure again"
        )
    media = await db.scalar(
        select(RoundMedia).where(
            RoundMedia.id == media_id, RoundMedia.round_id == round_id
        )
    )
    if media is None:
        raise HTTPException(404, "Recording not found")
    if await db.scalar(
        select(ProcessingJob.id).where(
            ProcessingJob.round_id == round_id, ProcessingJob.state.in_(ACTIVE)
        )
    ):
        raise HTTPException(
            409, "This round already has an active transcription request"
        )
    from app.services.interview_jobs import queue_count

    if await queue_count(db) >= MAX_QUEUE:
        raise HTTPException(503, "Transcription queue is full; retry later")
    job = ProcessingJob(
        user_id=auth.user.id,
        round_id=round_id,
        media_id=media_id,
        intent_id=intent_id,
        source_path=media.file_path,
        source_hash=media.sha256,
        media_generation=round.media_generation,
        transcript_generation=generation,
        config_revision=speech.revision,
        provider=speech.provider,
        model=speech.model,
        session_version=auth.user.session_version,
        api_key_id=auth.api_key.id if auth.api_key else None,
        required_scopes=SCOPES,
    )
    db.add(job)
    await db.flush()
    return job


async def retry_job(db: AsyncSession, auth: AuthContext, job_id: str, intent_id: str):
    await lock_ai_settings(db)
    job = await db.scalar(
        select(ProcessingJob).where(
            ProcessingJob.id == job_id, ProcessingJob.user_id == auth.user.id
        )
    )
    if job is None:
        raise HTTPException(404, "Transcription not found")
    if job.intent_id == intent_id or intent_id in job.retry_intents:
        return job
    if len(job.retry_intents) >= 32:
        raise HTTPException(
            409, "Retry limit reached; review outcomes and start a new request"
        )
    job, _, _ = await guard_job(db, job.id, job.claim_id, ("failed", "interrupted"))
    # Reuse cannot transfer authority to a different session/key or configuration.
    if (
        auth.user.session_version != job.session_version
        or (auth.api_key.id if auth.api_key else None) != job.api_key_id
    ):
        raise HTTPException(409, "Authority changed; start a new request")
    if await db.scalar(
        select(ProcessingJob.id).where(
            ProcessingJob.round_id == job.round_id, ProcessingJob.state.in_(ACTIVE)
        )
    ):
        raise HTTPException(
            409, "This round already has an active transcription request"
        )
    from app.services.interview_jobs import queue_count

    if await queue_count(db) >= MAX_QUEUE:
        raise HTTPException(503, "Transcription queue is full")
    job.state = job.stage = "queued"
    job.claim_id = None
    job.retry_intents = [*job.retry_intents, intent_id]
    job.error = None
    return job


async def checkpoint(
    db: AsyncSession, job_id: str, claim_id: str, chunk: dict, result: SpeechResult
):
    job, _, _ = await guard_job(db, job_id, claim_id, ("transcribing",))
    if job.stage != "dispatching" or not job.coverage or job.coverage[-1] != chunk:
        raise HTTPException(409, "No dispatched chunk is awaiting a response")
    segments = result.segments or []
    # Retain only source times inside the decoded chunk; never clamp or estimate them.
    if any(
        not 0 <= s["start"] < s["end"] <= chunk["end"] - chunk["start"]
        for s in segments
    ):
        segments = []
    absolute = [
        {**s, "start": s["start"] + chunk["start"], "end": s["end"] + chunk["start"]}
        for s in segments
    ]
    updated = [*job.checkpoints, {**chunk, "text": result.text, "segments": absolute}]
    if (
        len(updated) > 832
        or sum(len(c.get("segments", [])) for c in updated) > MAX_SEGMENTS
        or sum(
            len(c["text"].encode("utf-8"))
            + sum(len(s["text"].encode("utf-8")) for s in c.get("segments", []))
            for c in updated
        )
        > 2_000_000
    ):
        raise ValueError("Normalized transcript exceeded retained content limits")
    job.checkpoints = updated
    job.stage = "checkpointed"
    job.uncertain = False


async def checkpoint_silence(db: AsyncSession, job_id: str, claim_id: str, chunk: dict):
    # Locally detected dead air: complete coverage without any provider dispatch,
    # so the job is never marked uncertain and no remote work can occur.
    job, _, _ = await guard_job(db, job_id, claim_id, ("transcribing",))
    if not job.coverage or job.coverage[-1] != chunk:
        raise HTTPException(409, "No dispatched chunk is awaiting a response")
    updated = [*job.checkpoints, {**chunk, "text": ""}]
    if len(updated) > 832:
        raise ValueError("Normalized transcript exceeded retained content limits")
    job.checkpoints = updated
    job.stage = "checkpointed"


async def publish_result(
    db: AsyncSession,
    job_id: str,
    claim_id: str,
    coverage: list,
    *,
    structure_pending=False,
):
    job, _, _ = await guard_job(db, job_id, claim_id, ("transcribing",))
    if (
        not coverage
        or [
            {k: v for k, v in c.items() if k not in ("text", "segments")}
            for c in job.checkpoints
        ]
        != coverage
    ):
        raise ValueError("Transcript lacks complete matching chunk coverage")
    passages = []
    for chunk in sorted(
        job.checkpoints, key=lambda c: (c["start"], c["track"], c["channel"])
    ):
        speech_segments = chunk.get("segments")
        if not speech_segments:
            text = chunk["text"]
            speech_segments = [
                {"text": text[offset : offset + 64000]}
                for offset in range(0, len(text), 64000)
                if text[offset : offset + 64000].strip()
            ]
        for passage in speech_segments:
            passages.append(
                (
                    passage.get("start", chunk["start"]),
                    TranscriptSegment(
                        id=str(uuid4()),
                        **passage,
                        audio_channel=f"track {chunk['track'] + 1}, channel {chunk['channel'] + 1}",
                    ),
                )
            )
    segments = [segment for _, segment in sorted(passages, key=lambda item: item[0])]
    # Silence is a valid response but does not replace good existing text.
    if not segments:
        raise NoSpeechDetected("No speech text returned; existing transcript was kept")
    transcript = CurrentTranscript(
        id=str(uuid4()),
        revision=1,
        provenance="media",
        format="json",
        coverage="complete_audio",
        source_media_id=job.media_id,
        source_hash=job.source_hash,
        provider=job.provider,
        model=job.model,
        config_revision=job.config_revision,
        audio_coverage=coverage,
        segments=segments,
    )
    await db.execute(
        update(Round)
        .where(Round.id == job.round_id)
        .values(
            current_transcript=transcript.model_dump(),
            transcript_generation=Round.transcript_generation + 1,
            transcript_path=None,
            transcript_original_filename=None,
        )
        .execution_options(synchronize_session=False)
    )
    from app.services.interview_jobs import invalidate_interviews

    await invalidate_interviews(db, round_id=job.round_id)
    job.state = "transcribing" if structure_pending else "complete"
    job.stage = "structuring" if structure_pending else "complete"
    if structure_pending:
        # Subsequent role assignment must guard the newly published version, not its predecessor.
        job.transcript_generation += 1
    job.result_id = transcript.id
    job.coverage = coverage
    job.checkpoints = []
    job.uncertain = False
    job.error = None
    return transcript


async def finish_structure(db, job_id, claim_id, transcript, segments, settings):
    job, _, _ = await guard_job(db, job_id, claim_id, ("transcribing",))
    if job.stage != "structuring" or job.result_id != transcript.id:
        raise HTTPException(409, "Transcription result changed")
    current_settings = await get_ai_settings(db)
    if current_settings.revision != settings.revision or not supported(
        current_settings
    ):
        segments = None
    values = {
        **transcript.model_dump(),
        "structure_status": "Automatic sections unavailable",
    }
    if segments is not None:
        values.update(
            revision=transcript.revision + 1,
            segments=[s.model_dump() for s in segments],
            structure="automatic",
            structure_model=settings.effective_model,
            structure_status=None,
        )
    result = CurrentTranscript.model_validate(values)
    advance = 1 if segments is not None else 0
    await db.execute(
        update(Round)
        .where(Round.id == job.round_id)
        .values(
            current_transcript=result.model_dump(),
            transcript_generation=Round.transcript_generation + advance,
        )
        .execution_options(synchronize_session=False)
    )
    from app.services.interview_jobs import invalidate_interviews

    await invalidate_interviews(db, round_id=job.round_id)
    job.transcript_generation += advance
    job.state = job.stage = "complete"
    job.uncertain = False
    job.error = result.structure_status


def job_status(job: ProcessingJob):
    # Explicit allowlist; no source path, authority or text in summaries.
    return {
        "id": job.id,
        "round_id": job.round_id,
        "media_id": job.media_id,
        "state": job.state,
        "stage": job.stage,
        "provider": job.provider,
        "model": job.model,
        "uncertain": job.uncertain,
        "error": job.error,
        "error_code": "request_failed" if job.error else None,
        "completed_chunks": len(job.coverage)
        if job.state == "complete" or job.stage == "structuring"
        else len(job.checkpoints),
        "coverage": job.coverage,
        "result_id": job.result_id,
    }
