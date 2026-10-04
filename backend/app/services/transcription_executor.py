"""One lifespan-owned async executor. No thread can dispatch after lock release."""

import asyncio
import fcntl
import logging
import os
import shutil
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select, update

from app.core.config import get_settings, resolve_upload_path
from app.core.database import async_session_maker
from app.models import InterviewJob, ProcessingJob
from app.services import interview_jobs
from app.services.ai_settings import get_ai_settings
from app.services.interview_text import (
    SAFE_FAILURE_MESSAGES,
    report_failure_message,
    supported,
)
from app.services.speech_openai import transcribe_chunk
from app.services.transcription_audio import (
    inspect_audio,
    is_effectively_silent,
    prepare_channel,
)
from app.services.transcription_jobs import (
    NO_SPEECH_ERROR,
    NoSpeechDetected,
    checkpoint,
    checkpoint_silence,
    finish_structure,
    guard_job,
    publish_result,
)
from app.services.transcription_structure import structure_transcript

logger = logging.getLogger(__name__)


class TranscriptionExecutor:
    def __init__(self, sessions=async_session_maker, root: Path | None = None):
        self.sessions = sessions
        self.root = (
            root or Path(get_settings().upload_dir)
        ).resolve() / ".transcription"
        self.accepting = False
        self.task = None

    @asynccontextmanager
    async def lifespan(self):
        if any(
            os.environ.get(name, "1") != "1"
            for name in ("WEB_CONCURRENCY", "UVICORN_WORKERS")
        ):
            raise RuntimeError("Transcription requires one application process")
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Stable inode, never unlinked/recreated, timeout-stolen or leased.
        with (self.root / "owner.lock").open("a+b") as lock:
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    await asyncio.sleep(0.25)
            try:
                async with self.sessions() as db:
                    await db.execute(
                        update(ProcessingJob)
                        .where(ProcessingJob.state.in_(("preparing", "transcribing")))
                        .values(
                            state="interrupted",
                            stage="interrupted",
                            claim_id=None,
                            error="Execution interrupted. Explicit retry only; remote work and charges may already have occurred",
                        )
                    )
                    await db.commit()
                async with self.sessions() as db:
                    await db.execute(
                        update(InterviewJob)
                        .where(InterviewJob.state.in_(interview_jobs.ACTIVE))
                        .values(
                            state="interrupted",
                            claim_id=None,
                            checkpoints=[],
                            manifest={},
                            error=SAFE_FAILURE_MESSAGES["unknown"],
                        )
                    )
                    await db.commit()
                shutil.rmtree(self.root / "audio", ignore_errors=True)
                self.accepting = True
                self.task = asyncio.create_task(self.run())
                yield self
            finally:
                self.accepting = False
                if self.task is not None:
                    self.task.cancel()
                    # Repeated coroutine cancellation cannot release ownership.
                    # A hung callback keeps the lock until operator process death.
                    while not self.task.done():
                        with suppress(asyncio.CancelledError):
                            await asyncio.shield(self.task)
                    with suppress(asyncio.CancelledError):
                        self.task.result()
                fcntl.flock(lock, fcntl.LOCK_UN)

    async def run(self):
        while self.accepting:
            job_id = claim = None
            interview = False
            try:
                async with self.sessions() as db:
                    job_id = await db.scalar(
                        select(ProcessingJob.id)
                        .where(ProcessingJob.state == "queued")
                        .order_by(ProcessingJob.created_at)
                        .limit(1)
                    )
                    if job_id:
                        job, _, _ = await guard_job(db, job_id, None, ("queued",))
                        claim = str(uuid4())
                        changed = await db.scalar(
                            update(ProcessingJob)
                            .where(
                                ProcessingJob.id == job_id,
                                ProcessingJob.state == "queued",
                                ProcessingJob.claim_id.is_(None),
                            )
                            .values(
                                state="preparing", stage="preparing", claim_id=claim
                            )
                            .returning(ProcessingJob.id)
                        )
                        if not changed:
                            raise HTTPException(409, "Claim changed")
                        await db.commit()
                if not job_id:
                    async with self.sessions() as db:
                        job_id = await db.scalar(
                            select(InterviewJob.id)
                            .where(InterviewJob.state == "queued")
                            .order_by(InterviewJob.created_at)
                            .limit(1)
                        )
                        if job_id:
                            interview = True
                            job, _, _ = await interview_jobs.guard(
                                db, job_id, None, ("queued",)
                            )
                            claim = str(uuid4())
                            job.state = "analyzing"
                            job.claim_id = claim
                            await db.commit()
                if job_id:
                    assert claim is not None, (
                        "A queued job must be claimed before execution"
                    )
                    if interview:
                        await interview_jobs.execute(self, job_id, claim)
                    else:
                        await self.execute(job_id, claim)
                else:
                    await asyncio.sleep(0.25)
            except asyncio.CancelledError:
                if job_id:
                    await self.finish_failure(job_id, claim, "interrupted", interview)
                raise
            except NoSpeechDetected:
                # Honest, specific terminal outcome; a good transcript is preserved.
                if job_id:
                    await self.finish_failure(
                        job_id, claim, "failed", interview, NO_SPEECH_ERROR
                    )
                else:
                    await asyncio.sleep(1)
            except HTTPException as exc:
                if job_id:
                    await self.finish_failure(
                        job_id,
                        claim,
                        "invalidated"
                        if exc.status_code in (401, 403, 404, 409)
                        else "failed",
                        interview,
                    )
                else:
                    await asyncio.sleep(1)
            except Exception as exc:
                if job_id:
                    await self.finish_failure(
                        job_id,
                        claim,
                        "failed",
                        interview,
                        report_failure_message(exc) if interview else None,
                    )
                # Do not log exceptions: provider/SQL parameters may contain text.
                await asyncio.sleep(1)

    async def finish_failure(self, job_id, claim, state, interview=False, error=None):
        if interview:
            async with self.sessions() as db:
                manifest = {}
                if state == "failed":
                    job = await db.get(InterviewJob, job_id)
                    if job is not None and job.scope == "PIPELINE":
                        # Keep only the request clock/contract, never source metadata or output.
                        manifest = {
                            key: job.manifest[key]
                            for key in (
                                "period",
                                "as_of",
                                "time_zone",
                                "prompt_revision",
                            )
                            if key in (job.manifest or {})
                        }
                await db.execute(
                    update(InterviewJob)
                    .where(
                        InterviewJob.id == job_id,
                        InterviewJob.claim_id == claim,
                        InterviewJob.state.in_(interview_jobs.ACTIVE),
                    )
                    .values(
                        state=state,
                        checkpoints=[],
                        manifest=manifest,
                        error=error or SAFE_FAILURE_MESSAGES["unknown"],
                    )
                )
                await db.commit()
            return
        async with self.sessions() as db:
            values = {
                "state": state,
                "stage": state,
                "error": error
                or "Transcription stopped. Existing transcript was kept. Reload source/configuration; explicit retry may repeat remote work and charges",
            }
            if state == "invalidated":
                values.update(checkpoints=[], coverage=[], claim_id=None)
            await db.execute(
                update(ProcessingJob)
                .where(
                    ProcessingJob.id == job_id,
                    ProcessingJob.claim_id == claim,
                    ProcessingJob.state.in_(("queued", "preparing", "transcribing")),
                )
                .values(**values)
            )
            await db.commit()

    async def execute(self, job_id: str, claim: str):
        async with self.sessions() as db:
            job, _, _ = await guard_job(db, job_id, claim)
            path = Path(resolve_upload_path(job.source_path))
            expected_hash = job.source_hash
            await db.commit()
        digest, metadata, tracks, origin = await inspect_audio(path, expected_hash)
        async with self.sessions() as db:
            job, media, _ = await guard_job(db, job_id, claim)
            # Imported/legacy bytes become locally checked without re-upload.
            media.sha256 = job.source_hash = digest
            media.byte_count = path.stat().st_size
            media.probed_duration_seconds = metadata.duration
            media.validation = "audio_decode_check"
            prior = list(job.checkpoints)
            job.state = "transcribing"
            job.stage = "preparing"
            job.coverage = []
            await db.commit()
        coverage = []
        directory = self.root / "audio"
        directory.mkdir(mode=0o700, exist_ok=True)
        try:
            for track, stream in enumerate(tracks):
                for channel in range(int(stream["channels"])):
                    chunks = await prepare_channel(
                        path, directory, track, channel, origin, metadata.extension
                    )
                    for file, chunk in chunks:
                        # Reused checkpoints must match the newly decoded bytes and
                        # timeline as well as all durable source/authority guards.
                        position = len(coverage)
                        reuse = (
                            position < len(prior)
                            and {
                                k: v
                                for k, v in prior[position].items()
                                if k not in ("text", "segments")
                            }
                            == chunk
                        )
                        if position < len(prior) and not reuse:
                            raise HTTPException(
                                409, "Prepared audio changed; cannot reuse checkpoints"
                            )
                        coverage.append(chunk)
                        # Scan silence off the event loop before recording dispatch intent.
                        silent = not reuse and await asyncio.to_thread(
                            is_effectively_silent, file
                        )
                        async with self.sessions() as db:
                            job, _, speech = await guard_job(
                                db, job_id, claim, ("transcribing",)
                            )
                            job.coverage = list(coverage)
                            if not reuse and not silent:
                                if not self.accepting:
                                    raise asyncio.CancelledError
                                job.stage = "dispatching"
                                job.uncertain = True
                            await db.commit()
                        if not reuse:
                            if silent:
                                async with self.sessions() as db:
                                    await checkpoint_silence(db, job_id, claim, chunk)
                                    await db.commit()
                            else:
                                # Intent and uncertainty committed BEFORE entering SDK.
                                result = await transcribe_chunk(speech, file)
                                async with self.sessions() as db:
                                    await checkpoint(db, job_id, claim, chunk, result)
                                    await db.commit()
                        file.unlink()
            async with self.sessions() as db:
                transcript = await publish_result(
                    db, job_id, claim, coverage, structure_pending=True
                )
                await db.commit()
            # Speech is durable before the optional text-model call. The same job
            # stays active until roles are saved or the safe fallback is recorded.
            async with self.sessions() as db:
                job, _, _ = await guard_job(db, job_id, claim, ("transcribing",))
                settings = await get_ai_settings(db)
                if not self.accepting:
                    raise asyncio.CancelledError
                job.uncertain = supported(settings)
                await db.commit()
            segments = None
            if supported(settings):
                # Never retain provider output/errors or fail good speech for roles.
                # Cancellation still propagates; it is not an Exception.
                try:
                    segments = await structure_transcript(
                        settings, transcript.segments, session_id=job_id
                    )
                except Exception as exc:
                    # Category only: no provider body, transcript text or credential.
                    logger.warning(
                        "Automatic transcript sections unavailable: %s",
                        type(exc).__name__,
                    )
            async with self.sessions() as db:
                await finish_structure(
                    db, job_id, claim, transcript, segments, settings
                )
                await db.commit()
        finally:
            # No subprocess survives prepare_channel cancellation/return.
            shutil.rmtree(directory, ignore_errors=True)
