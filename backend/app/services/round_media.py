"""Transactional round media mutation precondition shared by upload and deletion."""

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, Round
from app.services.ai_settings import lock_ai_settings
from app.services.interview_jobs import invalidate_interviews


async def claim_media_generation(
    db: AsyncSession, round_id: str, user_id: str, generation: int
) -> None:
    await lock_ai_settings(db)
    # Compare and advance the generation under the database write lock.
    result = await db.execute(
        update(Round)
        .where(
            Round.id == round_id,
            Round.media_generation == generation,
            Round.application_id.in_(
                select(Application.id).where(Application.user_id == user_id)
            ),
        )
        .values(media_generation=Round.media_generation + 1)
        .returning(Round.id)
        .execution_options(synchronize_session=False)
    )
    if result.scalar_one_or_none() is None:
        await db.rollback()
        raise HTTPException(
            409,
            "Recordings changed or the round was deleted. Reload and review before retrying; the existing recording and transcript were not replaced",
        )
    from app.services.transcription_jobs import invalidate_round_jobs

    await invalidate_round_jobs(db, round_id)


async def remove_media_transcript(db: AsyncSession, round_id: str, media_id: str):
    # Caller holds claim_media_generation's round write lock. Corrections retain
    # media provenance and are removed with their source; pasted text is separate.
    round = await db.scalar(
        select(Round)
        .where(Round.id == round_id)
        .execution_options(populate_existing=True)
    )
    if (
        round
        and round.interview_report
        and round.interview_report.get("source_media_id") == media_id
    ):
        await invalidate_interviews(db, round_id=round_id, removed=True)
    if (
        round
        and round.current_transcript
        and round.current_transcript.get("source_media_id") == media_id
    ):
        await invalidate_interviews(db, round_id=round_id, removed=True)
        await db.execute(
            update(Round)
            .where(Round.id == round_id)
            .values(
                current_transcript=None,
                transcript_generation=Round.transcript_generation + 1,
                transcript_path=None,
                transcript_original_filename=None,
                transcript_summary=None,
            )
            .execution_options(synchronize_session=False)
        )
