import mimetypes
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import resolve_upload_path
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.core.security import (
    create_file_token,
    create_media_token,
    create_round_transcript_token,
    decode_file_token,
    decode_media_token,
    decode_round_transcript_token,
)
from app.models import Application, Round, RoundMedia, User

router = APIRouter(prefix="/api/files", tags=["files"])


class SignedUrlResponse(BaseModel):
    url: str
    expires_in: int


# Media endpoints (must be before generic {application_id}/{doc_type} routes)
@router.get("/media/{media_id}/signed", response_model=SignedUrlResponse)
async def get_media_signed_url(
    media_id: str,
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a signed URL for media file access."""
    result = await db.execute(
        select(RoundMedia)
        .join(Round)
        .join(Application)
        .where(RoundMedia.id == media_id, Application.user_id == user.id)
    )
    media = result.scalars().first()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    token = create_media_token(media_id, str(user.id))
    url = f"/api/files/media/{media_id}?token={token}&disposition={disposition}"

    return SignedUrlResponse(url=url, expires_in=300)


@router.get("/media/{media_id}")
async def get_media_file(
    media_id: str,
    token: str | None = Query(None),
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    user: User | None = Depends(get_current_user_optional),  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
):
    """Serve a media file. Accepts either auth header or signed token."""
    user_id = None

    # Try token-based auth first
    if token:
        payload = decode_media_token(token)
        if payload:
            if payload.get("media_id") != media_id:
                raise HTTPException(status_code=403, detail="Token mismatch")
            user_id = payload.get("user_id")

    # Fall back to header-based auth
    if not user_id and user:
        user_id = str(user.id)

    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(
        select(RoundMedia)
        .join(Round)
        .join(Application)
        .where(RoundMedia.id == media_id, Application.user_id == user_id)
    )
    media = result.scalars().first()

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Resolve stored path to actual filesystem path using UPLOAD_DIR
    file_path = resolve_upload_path(media.file_path)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type:
        if media.media_type == "video":
            media_type = "video/mp4"
        elif media.media_type == "audio":
            media_type = "audio/mpeg"
        else:
            media_type = "application/octet-stream"

    # Use original filename if available, otherwise fall back to hash-based name
    filename = media.original_filename or os.path.basename(file_path)

    if disposition == "attachment":
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        # Force octet-stream for PDF attachments to prevent Firefox from opening in tab
        # This works around Firefox Bug 453455 where user PDF preferences override Content-Disposition
        if media_type == "application/pdf":
            media_type = "application/octet-stream"
    else:
        headers = {"Content-Disposition": f'inline; filename="{filename}"'}

    return FileResponse(
        file_path,
        media_type=media_type,
        headers=headers,
    )


# Round transcript endpoints
@router.get("/rounds/{round_id}/transcript/signed", response_model=SignedUrlResponse)
async def get_round_transcript_signed_url(
    round_id: str,
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a signed URL for round transcript access."""
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user.id)
    )
    round_obj = result.scalars().first()

    if not round_obj or not round_obj.transcript_path:
        raise HTTPException(status_code=404, detail="Transcript not found")

    token = create_round_transcript_token(round_id, str(user.id))
    url = f"/api/files/rounds/{round_id}/transcript?token={token}&disposition={disposition}"

    return SignedUrlResponse(url=url, expires_in=300)


@router.get("/rounds/{round_id}/transcript")
async def get_round_transcript_file(
    round_id: str,
    token: str | None = Query(None),
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    user: User | None = Depends(get_current_user_optional),  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
):
    """Serve a round transcript file. Accepts either auth header or signed token."""
    user_id = None

    # Try token-based auth first
    if token:
        payload = decode_round_transcript_token(token)
        if payload:
            if payload.get("round_id") != round_id:
                raise HTTPException(status_code=403, detail="Token mismatch")
            user_id = payload.get("user_id")

    # Fall back to header-based auth
    if not user_id and user:
        user_id = str(user.id)

    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user_id)
    )
    round_obj = result.scalars().first()

    if not round_obj or not round_obj.transcript_path:
        raise HTTPException(status_code=404, detail="Transcript not found")

    # Resolve stored path to actual filesystem path using UPLOAD_DIR
    file_path = resolve_upload_path(round_obj.transcript_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type:
        media_type = "application/octet-stream"

    filename = os.path.basename(file_path)

    if disposition == "attachment":
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        if media_type == "application/pdf":
            media_type = "application/octet-stream"
    else:
        headers = {"Content-Disposition": f'inline; filename="{filename}"'}

    return FileResponse(
        file_path,
        media_type=media_type,
        headers=headers,
    )


# Document endpoints
@router.get("/{application_id}/{doc_type}/signed", response_model=SignedUrlResponse)
async def get_signed_url(
    application_id: str,
    doc_type: str,
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a signed URL for file access."""
    if doc_type not in ("cv", "cover-letter"):
        raise HTTPException(status_code=400, detail="Invalid document type")

    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    path_map = {
        "cv": application.cv_path,
        "cover-letter": application.cover_letter_path,
    }

    if not path_map.get(doc_type):
        raise HTTPException(status_code=404, detail="File not found")

    token = create_file_token(application_id, doc_type, str(user.id))
    url = f"/api/files/{application_id}/{doc_type}?token={token}&disposition={disposition}"

    return SignedUrlResponse(url=url, expires_in=300)


@router.get("/{application_id}/{doc_type}")
async def get_file(
    application_id: str,
    doc_type: str,
    token: str | None = Query(None),
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    user: User | None = Depends(get_current_user_optional),  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
):
    """Serve a file. Accepts either auth header or signed token."""
    user_id = None

    # Try token-based auth first
    if token:
        payload = decode_file_token(token)
        if payload:
            if payload.get("application_id") != application_id:
                raise HTTPException(status_code=403, detail="Token mismatch")
            if payload.get("doc_type") != doc_type:
                raise HTTPException(status_code=403, detail="Token mismatch")
            user_id = payload.get("user_id")

    # Fall back to header-based auth
    if not user_id and user:
        user_id = str(user.id)

    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user_id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    path_map = {
        "cv": application.cv_path,
        "cover-letter": application.cover_letter_path,
    }
    original_filename_map = {
        "cv": application.cv_original_filename,
        "cover-letter": application.cover_letter_original_filename,
    }

    stored_path = path_map.get(doc_type)
    if not stored_path:
        raise HTTPException(status_code=404, detail="File not found")

    # Resolve stored path to actual filesystem path using UPLOAD_DIR
    file_path = resolve_upload_path(stored_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type:
        media_type = "application/octet-stream"

    # Use original filename if available, otherwise fall back to hash-based name
    filename = original_filename_map.get(doc_type) or os.path.basename(file_path)

    # Set content disposition
    if disposition == "attachment":
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        # Force octet-stream for PDF attachments to prevent Firefox from opening in tab
        # This works around Firefox Bug 453455 where user PDF preferences override Content-Disposition
        if media_type == "application/pdf":
            media_type = "application/octet-stream"
    else:
        headers = {"Content-Disposition": f'inline; filename="{filename}"'}

    return FileResponse(
        file_path,
        media_type=media_type,
        headers=headers,
    )
