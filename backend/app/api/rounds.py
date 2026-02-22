import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.streak import record_streak_activity
from app.api.utils.zip_utils import (
    ALLOWED_DOCUMENT_TYPES,
    ALLOWED_MEDIA_TYPES,
    sanitize_filename,
    store_file,
    validate_file,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, Round, RoundMedia, RoundType, User
from app.schemas.round import RoundCreate, RoundResponse, RoundUpdate

router = APIRouter(tags=["rounds"])
settings = get_settings()


async def get_user_application(
    application_id: str, user: User, db: AsyncSession
) -> Application:
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.post(
    "/api/applications/{application_id}/rounds",
    response_model=RoundResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_round(
    application_id: str,
    data: RoundCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_user_application(application_id, user, db)

    result = await db.execute(
        select(RoundType).where(
            RoundType.id == data.round_type_id,
            or_(RoundType.user_id == user.id, RoundType.user_id.is_(None)),
        )
    )
    if not result.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid round type")

    round = Round(
        application_id=application_id,
        round_type_id=data.round_type_id,
        scheduled_at=data.scheduled_at,
        notes_summary=data.notes_summary,
    )
    db.add(round)
    await db.commit()
    await record_streak_activity(user=user, db=db)

    result = await db.execute(
        select(Round)
        .where(Round.id == round.id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
    )
    return result.scalars().first()


@router.patch("/api/rounds/{round_id}", response_model=RoundResponse)
async def update_round(
    round_id: str,
    data: RoundUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user.id)
    )
    round = result.scalars().first()

    if not round:
        raise HTTPException(status_code=404, detail="Round not found")

    if data.round_type_id:
        result = await db.execute(
            select(RoundType).where(
                RoundType.id == data.round_type_id,
                or_(RoundType.user_id == user.id, RoundType.user_id.is_(None)),
            )
        )
        if not result.scalars().first():
            raise HTTPException(status_code=400, detail="Invalid round type")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(round, key, value)

    await db.commit()
    await record_streak_activity(user=user, db=db)

    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
    )
    return result.scalars().first()


@router.delete("/api/rounds/{round_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_round(
    round_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user.id)
        .options(selectinload(Round.media))
    )
    round = result.scalars().first()

    if not round:
        raise HTTPException(status_code=404, detail="Round not found")

    # Note: We don't delete CAS files as they may be shared/deduplicated
    # Files are cleaned up via separate maintenance process if needed
    await db.delete(round)
    await db.commit()


@router.post("/api/rounds/{round_id}/media", response_model=RoundResponse)
async def upload_media(
    round_id: str,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user.id)
    )
    round = result.scalars().first()

    if not round:
        raise HTTPException(status_code=404, detail="Round not found")

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Read file content
    content = await file.read()
    max_size = settings.max_media_size_mb * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_media_size_mb}MB",
        )

    # Write to temp file for magic byte validation
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        # Validate file type using magic bytes
        is_valid, detected_type = validate_file(tmp_path, ALLOWED_MEDIA_TYPES)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type: {detected_type}. Must be video (MP4, WebM, MOV) or audio (MP3, WAV, M4A, OGG)",
            )

        # Determine media type from detected MIME
        media_type = "video" if detected_type.startswith("video/") else "audio"

        # Store file using CAS
        file_path = await store_file(content, upload_dir)
    finally:
        tmp_path.unlink(missing_ok=True)

    media = RoundMedia(
        round_id=round_id,
        file_path=file_path,
        original_filename=sanitize_filename(file.filename or "unnamed"),
        media_type=media_type,
    )
    db.add(media)
    await db.commit()
    await record_streak_activity(user=user, db=db)

    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
    )
    return result.scalars().first()


@router.delete("/api/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoundMedia)
        .join(Round)
        .join(Application)
        .where(RoundMedia.id == media_id, Application.user_id == user.id)
    )
    media = result.scalars().first()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Note: We don't delete CAS files as they may be shared/deduplicated
    await db.delete(media)
    await db.commit()


@router.post("/api/rounds/{round_id}/transcript", response_model=RoundResponse)
async def upload_transcript(
    round_id: str,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload transcript for a round. Accepts PDF, DOCX, DOC, TXT, MD, RTF."""
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user.id)
    )
    round = result.scalars().first()

    if not round:
        raise HTTPException(status_code=404, detail="Round not found")

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Read file content
    content = await file.read()
    max_size = settings.max_document_size_mb * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_document_size_mb}MB",
        )

    # Write to temp file for magic byte validation
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        # Validate file type using magic bytes
        is_valid, detected_type = validate_file(tmp_path, ALLOWED_DOCUMENT_TYPES)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type: {detected_type}. Must be a document (PDF, DOCX, DOC, TXT, MD, RTF)",
            )

        # Store file using CAS
        file_path = await store_file(content, upload_dir)
    finally:
        tmp_path.unlink(missing_ok=True)

    # Update round
    round.transcript_path = file_path
    await db.commit()
    await record_streak_activity(user=user, db=db)

    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
    )
    return result.scalars().first()


@router.delete(
    "/api/rounds/{round_id}/transcript", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_transcript(
    round_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete transcript from a round."""
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user.id)
    )
    round = result.scalars().first()

    if not round:
        raise HTTPException(status_code=404, detail="Round not found")

    # Note: We don't delete CAS files as they may be shared/deduplicated
    round.transcript_path = None
    round.transcript_summary = None
    await db.commit()
