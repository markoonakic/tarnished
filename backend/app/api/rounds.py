import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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

    result = await db.execute(
        select(Round)
        .where(Round.id == round.id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
    )
    return result.scalars().first()


@router.put("/api/rounds/{round_id}", response_model=RoundResponse)
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

    for media in round.media:
        if os.path.exists(media.file_path):
            os.remove(media.file_path)

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

    content_type = file.content_type or ""
    if content_type.startswith("video/"):
        media_type = "video"
    elif content_type.startswith("audio/"):
        media_type = "audio"
    else:
        raise HTTPException(status_code=400, detail="File must be video or audio")

    os.makedirs(settings.upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    file_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.upload_dir, file_name)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    media = RoundMedia(
        round_id=round_id,
        file_path=file_path,
        media_type=media_type,
    )
    db.add(media)
    await db.commit()

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

    if os.path.exists(media.file_path):
        os.remove(media.file_path)

    await db.delete(media)
    await db.commit()
