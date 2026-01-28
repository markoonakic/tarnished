import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.lib.streak import record_activity_streak
from app.models import Application, ApplicationStatus, ApplicationStatusHistory, Round, User
from app.schemas.application import (
    ApplicationCreate,
    ApplicationListItem,
    ApplicationListResponse,
    ApplicationResponse,
    ApplicationUpdate,
)

router = APIRouter(prefix="/api/applications", tags=["applications"])


@router.get("", response_model=ApplicationListResponse)
async def list_applications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_id: str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Application)
        .where(Application.user_id == user.id)
        .options(selectinload(Application.status))
    )

    if status_id:
        query = query.where(Application.status_id == status_id)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Application.company.ilike(search_term),
                Application.job_title.ilike(search_term),
                Application.job_description.ilike(search_term),
            )
        )

    if date_from:
        query = query.where(Application.applied_at >= date_from)

    if date_to:
        query = query.where(Application.applied_at <= date_to)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Application.applied_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    applications = result.scalars().all()

    return ApplicationListResponse(
        items=applications,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("", response_model=ApplicationListItem, status_code=status.HTTP_201_CREATED)
async def create_application(
    data: ApplicationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationStatus).where(
            ApplicationStatus.id == data.status_id,
            or_(ApplicationStatus.user_id == user.id, ApplicationStatus.user_id.is_(None)),
        )
    )
    if not result.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid status")

    application = Application(
        user_id=user.id,
        company=data.company,
        job_title=data.job_title,
        job_description=data.job_description,
        job_url=data.job_url,
        status_id=data.status_id,
        applied_at=data.applied_at or date.today(),
    )
    db.add(application)
    await db.commit()
    await record_activity_streak(db=db, user=user)

    result = await db.execute(
        select(Application)
        .where(Application.id == application.id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()


@router.get("/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application)
        .where(Application.id == application_id, Application.user_id == user.id)
        .options(
            selectinload(Application.status),
            selectinload(Application.rounds).selectinload(Round.round_type),
            selectinload(Application.rounds).selectinload(Round.media),
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    return application


@router.put("/{application_id}", response_model=ApplicationListItem)
async def update_application(
    application_id: str,
    data: ApplicationUpdate,
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

    if data.status_id:
        result = await db.execute(
            select(ApplicationStatus).where(
                ApplicationStatus.id == data.status_id,
                or_(ApplicationStatus.user_id == user.id, ApplicationStatus.user_id.is_(None)),
            )
        )
        if not result.scalars().first():
            raise HTTPException(status_code=400, detail="Invalid status")

    # Track status change if status_id is being updated
    old_status_id = application.status_id
    status_changed = False

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "status_id" and value != old_status_id:
            status_changed = True
        setattr(application, key, value)

    await db.commit()

    # Create status history entry if status changed
    if status_changed:
        history_entry = ApplicationStatusHistory(
            application_id=application.id,
            from_status_id=old_status_id,
            to_status_id=data.status_id,
        )
        db.add(history_entry)
        await db.commit()
        await record_activity_streak(db=db, user=user)

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(
    application_id: str,
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

    await db.delete(application)
    await db.commit()


@router.post("/{application_id}/cv", response_model=ApplicationListItem)
async def upload_cv(
    application_id: str,
    file: UploadFile,
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

    allowed_types = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File must be PDF or Word document")

    if application.cv_path and os.path.exists(application.cv_path):
        os.remove(application.cv_path)

    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".pdf"
    file_name = f"cv_{application_id}{ext}"
    file_path = os.path.join(settings.upload_dir, file_name)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    application.cv_path = file_path
    await db.commit()

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()


@router.delete("/{application_id}/cv", response_model=ApplicationListItem)
async def delete_cv(
    application_id: str,
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

    if application.cv_path and os.path.exists(application.cv_path):
        os.remove(application.cv_path)

    application.cv_path = None
    await db.commit()

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()


@router.post("/{application_id}/cover-letter", response_model=ApplicationListItem)
async def upload_cover_letter(
    application_id: str,
    file: UploadFile,
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

    allowed_types = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File must be PDF or Word document")

    if application.cover_letter_path and os.path.exists(application.cover_letter_path):
        os.remove(application.cover_letter_path)

    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".pdf"
    file_name = f"cover_letter_{application_id}{ext}"
    file_path = os.path.join(settings.upload_dir, file_name)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    application.cover_letter_path = file_path
    await db.commit()

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()


@router.delete("/{application_id}/cover-letter", response_model=ApplicationListItem)
async def delete_cover_letter(
    application_id: str,
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

    if application.cover_letter_path and os.path.exists(application.cover_letter_path):
        os.remove(application.cover_letter_path)

    application.cover_letter_path = None
    await db.commit()

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()


@router.post("/{application_id}/transcript", response_model=ApplicationListItem)
async def upload_transcript(
    application_id: str,
    file: UploadFile,
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

    allowed_types = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File must be PDF or Word document")

    if application.transcript_path and os.path.exists(application.transcript_path):
        os.remove(application.transcript_path)

    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".pdf"
    file_name = f"transcript_{application_id}{ext}"
    file_path = os.path.join(settings.upload_dir, file_name)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    application.transcript_path = file_path
    await db.commit()

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()


@router.delete("/{application_id}/transcript", response_model=ApplicationListItem)
async def delete_transcript(
    application_id: str,
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

    if application.transcript_path and os.path.exists(application.transcript_path):
        os.remove(application.transcript_path)

    application.transcript_path = None
    await db.commit()

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()
