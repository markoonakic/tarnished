import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, User

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{application_id}/{doc_type}")
async def get_file(
    application_id: str,
    doc_type: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application)
        .where(Application.id == application_id, Application.user_id == user.id)
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    path_map = {
        "cv": application.cv_path,
        "cover-letter": application.cover_letter_path,
        "transcript": application.transcript_path,
    }

    file_path = path_map.get(doc_type)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        file_path,
        filename=os.path.basename(file_path),
        media_type="application/octet-stream",
    )
