"""Parse supplied English text without estimating speakers, timing or coverage."""

import re
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, Round
from app.schemas.transcript import (
    MAX_SEGMENTS,
    MAX_TRANSCRIPT_BYTES,
    CurrentTranscript,
    TranscriptSegment,
)
from app.services.ai_settings import lock_ai_settings
from app.services.interview_jobs import invalidate_interviews

TIMESTAMP = r"(?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3}"
CUE = re.compile(rf"^({TIMESTAMP}) --> ({TIMESTAMP})(?: (.+))?$")


def seconds(value: str) -> float:
    parts = value.replace(",", ".").split(":")
    if len(parts) == 2:
        parts.insert(0, "0")
    hours, minutes, secs = int(parts[0]), int(parts[1]), float(parts[2])
    if hours > 2 or minutes >= 60 or secs >= 60:
        raise ValueError("Invalid transcript timestamp")
    return hours * 3600 + minutes * 60 + secs


def parse_transcript(content: bytes, format: str, provenance: str) -> CurrentTranscript:
    if len(content) > MAX_TRANSCRIPT_BYTES:
        raise ValueError("Transcript exceeds 2,000,000 bytes")
    text = content.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    if not text.strip() or "\x00" in text:
        raise ValueError("Transcript must be nonempty and contain no NUL")
    segments = []
    if format == "txt":
        lines = [line for line in text.splitlines() if line.strip()]
        if len(lines) > MAX_SEGMENTS:
            raise ValueError("Too many transcript passages")
        segments = [TranscriptSegment(id=str(uuid4()), text=line) for line in lines]
    elif format in ("srt", "vtt"):
        blocks = re.split(r"\n[ \t]*\n", text.strip())
        if format == "vtt":
            if not blocks or blocks[0].splitlines()[0] != "WEBVTT":
                raise ValueError("VTT must begin with WEBVTT and a blank line")
            if len(blocks[0].splitlines()) != 1:
                raise ValueError("VTT header metadata is not supported")
            blocks = blocks[1:]
        for block in blocks:
            if len(segments) >= MAX_SEGMENTS:
                raise ValueError("Too many transcript passages")
            lines = block.splitlines()
            if not lines:
                continue
            if format == "vtt" and (lines[0] == "NOTE" or lines[0].startswith("NOTE ")):
                continue
            if " --> " not in lines[0]:
                if format == "srt" and not lines[0].isdigit():
                    raise ValueError("SRT cue number is invalid")
                lines = lines[1:]
            match = CUE.fullmatch(lines[0]) if lines else None
            if not match or len(lines) < 2:
                raise ValueError("Invalid or empty subtitle cue")
            if match[3] and (
                format == "srt"
                or not all(
                    re.fullmatch(r"(?:align|line|position|size|vertical):\S+", item)
                    for item in match[3].split()
                )
            ):
                raise ValueError("Unsupported subtitle cue settings")
            passage = "\n".join(lines[1:])
            speaker = None
            voice = (
                re.fullmatch(r"<v ([^<>\n]{1,100})>([\s\S]*?)(?:</v>)?", passage)
                if format == "vtt"
                else None
            )
            if voice and not re.search(r"</?v(?:[ >])", voice[2]):
                speaker, passage = voice[1], voice[2]
            segments.append(
                TranscriptSegment(
                    id=str(uuid4()),
                    text=passage,
                    start=seconds(match[1]),
                    end=seconds(match[2]),
                    speaker=speaker,
                )
            )
    else:
        raise ValueError("Use UTF-8 TXT, SRT or VTT")
    return CurrentTranscript.model_validate(
        {
            "id": str(uuid4()),
            "revision": 1,
            "provenance": provenance,
            "format": format,
            "segments": [segment.model_dump() for segment in segments],
        }
    )


async def owned_round(db: AsyncSession, round_id: str, user_id: str) -> Round:
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    round = result.scalar_one_or_none()
    if round is None:
        raise HTTPException(404, "Round not found")
    return round


def expected_generation(round: Round, expected: int | None) -> int:
    if expected is None and round.current_transcript is not None:
        raise HTTPException(
            409,
            "Read the current transcript and supply Expected-Transcript-Generation before replacing or deleting it",
        )
    if expected is not None and expected != round.transcript_generation:
        raise HTTPException(
            409,
            "Transcript changed. Reload before retrying; your draft has not been saved",
        )
    return round.transcript_generation


async def publish_transcript(
    db: AsyncSession,
    round_id: str,
    user_id: str,
    generation: int,
    values: dict,
    *,
    legacy: bool = False,
) -> None:
    await lock_ai_settings(db)
    # One UPDATE is the serialization boundary on both databases, including delete.
    conditions = [
        Round.id == round_id,
        Round.transcript_generation == generation,
        Round.application_id.in_(
            select(Application.id).where(Application.user_id == user_id)
        ),
    ]
    if legacy:
        conditions.append(Round.current_transcript.is_(None))
    result = await db.execute(
        update(Round)
        .where(*conditions)
        .values(**values, transcript_generation=Round.transcript_generation + 1)
        .returning(Round.id)
        .execution_options(synchronize_session=False)
    )
    if result.scalar_one_or_none() is None:
        await db.rollback()
        raise HTTPException(
            409,
            "Transcript changed or was removed. Reload before retrying; your draft has not been saved",
        )
    from app.services.transcription_jobs import invalidate_round_jobs

    await invalidate_round_jobs(db, round_id)
    await invalidate_interviews(
        db,
        round_id=round_id,
        removed="current_transcript" in values and values["current_transcript"] is None,
    )
    await db.commit()
