from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.streak import record_streak_activity
from app.api.utils.upload_route import UploadLimitRoute
from app.api.utils.zip_utils import (
    ALLOWED_DOCUMENT_TYPES,
    sanitize_filename,
    store_file,
    validate_file,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    get_current_user_flexible,
    get_request_time_zone,
    require_api_key_scope,
)
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    Round,
    User,
)
from app.models.workspace import ApplicationContact
from app.schemas.application import (
    ApplicationCreate,
    ApplicationExtractRequest,
    ApplicationListItem,
    ApplicationListResponse,
    ApplicationResponse,
    ApplicationSummary,
    ApplicationUpdate,
)
from app.services.ai_settings import get_ai_settings as get_ai_settings
from app.services.ai_settings import lock_ai_settings
from app.services.application_evidence import (
    compare_and_set_application,
    initial_evidence,
    response_values,
    validate_response_date,
)
from app.services.create_retry import recover_create
from app.services.extraction import extract_job_data as extract_job_data
from app.services.interview_jobs import invalidate_interviews
from app.services.job_fetch import fetch_job_posting_html
from app.services.job_filters import JobFilters, apply_filters, filter_params
from app.services.user_time import get_user_local_today
from app.services.workspace import JOB_FIELDS, audit, job_links

router = APIRouter(
    prefix="/api/applications", tags=["applications"], route_class=UploadLimitRoute
)


@router.get("", response_model=ApplicationListResponse)
async def list_applications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_id: str | None = None,
    source: str | None = None,
    search: str | None = Query(None, max_length=200),
    url: str | None = Query(
        None, description="Filter by exact job URL (used by extension)"
    ),
    filters: JobFilters = Depends(filter_params),
    date_from: date | None = None,
    date_to: date | None = None,
    sort: Literal[
        "applied_desc", "applied_asc", "company", "status", "updated"
    ] = "applied_desc",
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("applications:read")),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Application)
        .where(Application.user_id == user.id)
        .options(selectinload(Application.status))
    )

    if status_id:
        query = query.where(Application.status_id == status_id)

    if source:
        query = query.where(Application.source == source)

    # Exact URL match (used by extension to check for existing applications)
    if url:
        query = query.where(Application.job_url == url)

    # Partial text search (company, title, description)
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Application.company.ilike(search_term),
                Application.job_title.ilike(search_term),
                Application.job_description.ilike(search_term),
            )
        )

    query = apply_filters(query, Application, filters, date_from, date_to)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    order = {
        "applied_desc": Application.applied_at.desc(),
        "applied_asc": Application.applied_at.asc(),
        "company": func.lower(Application.company).asc(),
        "status": select(func.lower(ApplicationStatus.name))
        .where(ApplicationStatus.id == Application.status_id)
        .scalar_subquery()
        .asc(),
        "updated": Application.updated_at.desc(),
    }[sort]
    query = query.order_by(order, Application.created_at.desc(), Application.id)
    query = query.offset((page - 1) * per_page).limit(per_page)

    round_count = (
        select(func.count(Round.id))
        .where(Round.application_id == Application.id)
        .correlate(Application)
        .scalar_subquery()
    )
    result = await db.execute(query.add_columns(round_count.label("round_count")))

    return ApplicationListResponse(
        items=[
            ApplicationSummary(
                **ApplicationListItem.model_validate(row["Application"]).model_dump(),
                round_count=row["round_count"],
            )
            for row in result.mappings()
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/sources")
async def list_application_sources(
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("applications:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application.source)
        .where(Application.user_id == user.id, Application.source.is_not(None))
        .distinct()
        .order_by(Application.source.asc())
    )
    sources = [source for source in result.scalars().all() if source]
    return {"sources": sources}


@router.post(
    "", response_model=ApplicationListItem, status_code=status.HTTP_201_CREATED
)
async def create_application(
    data: ApplicationCreate,
    idempotency_key: UUID | None = Header(default=None),
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("applications:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationStatus).where(
            ApplicationStatus.id == data.status_id,
            or_(
                ApplicationStatus.user_id == user.id,
                ApplicationStatus.user_id.is_(None),
            ),
        )
    )
    selected_status = result.scalars().first()
    if not selected_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status"
        )

    values = data.model_dump(exclude_unset=True, exclude={"response_evidence"})
    if values.get("company_id"):
        values.pop("company", None)
    if "response_evidence" in data.model_fields_set:
        values.update(
            response_values(
                data.response_evidence,
                get_user_local_today(user, x_timezone=x_timezone),
            )
        )
    existing = await recover_create(db, Application, idempotency_key, user.id, values)
    if existing is not None:
        await db.refresh(existing, ["status"])
        return existing

    if (
        "applied_at" in data.model_fields_set
        and data.applied_at is None
        and selected_status.meaning != "preparing"
    ):
        raise HTTPException(422, "Only Preparing can have no applied date")
    extra = data.model_dump(include=set(JOB_FIELDS), exclude_unset=True)
    legacy_recruiter = {
        field: getattr(data, field)
        for field in ("recruiter_name", "recruiter_title", "recruiter_linkedin_url")
        if field in data.model_fields_set
    }
    extra.update(legacy_recruiter)
    await job_links(db, user.id, extra)
    for field in legacy_recruiter:
        extra.pop(field, None)
    if selected_status.meaning != "preparing" and (
        not extra.get("company", data.company).strip() or not data.job_title.strip()
    ):
        raise HTTPException(422, "Company and position are required")
    application = Application(
        **({"id": str(idempotency_key)} if idempotency_key else {}),
        **{key: value for key, value in extra.items() if key != "company"},
        user_id=user.id,
        company=extra.get("company", data.company),
        job_title=data.job_title,
        job_description=data.job_description,
        job_url=data.job_url,
        status_id=data.status_id,
        applied_at=data.applied_at or get_user_local_today(user, x_timezone=x_timezone),
        location=data.location,
        salary_min=data.salary_min,
        salary_max=data.salary_max,
        salary_currency=data.salary_currency,
        recruiter_name=data.recruiter_name,
        recruiter_title=data.recruiter_title,
        recruiter_linkedin_url=data.recruiter_linkedin_url,
        requirements_must_have=data.requirements_must_have,
        requirements_nice_to_have=data.requirements_nice_to_have,
        skills=data.skills,
        years_experience_min=data.years_experience_min,
        years_experience_max=data.years_experience_max,
        source=data.source,
    )
    db.add(application)
    await db.flush()
    if application.recruiter_contact_id:
        db.add(
            ApplicationContact(
                user_id=user.id,
                application_id=application.id,
                contact_id=application.recruiter_contact_id,
            )
        )
    await audit(db, user.id, "application.created", application)
    try:
        db.add(application)
        await db.flush()  # Get the generated ID

        db.add(
            initial_evidence(
                application,
                selected_status,
                applied_at_provided=data.applied_at is not None,
            )
        )
        for key, value in response_values(
            data.response_evidence, get_user_local_today(user, x_timezone=x_timezone)
        ).items():
            setattr(application, key, value)

        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    await record_streak_activity(user=user, db=db, x_timezone=x_timezone)

    result = await db.execute(
        select(Application)
        .where(Application.id == application.id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()


@router.post(
    "/extract", response_model=ApplicationListItem, status_code=status.HTTP_201_CREATED
)
async def create_application_from_url(
    data: ApplicationExtractRequest,
    idempotency_key: UUID | None = Header(default=None),
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("applications:write")),
    db: AsyncSession = Depends(get_db),
):
    """Compatibility adapter: create Preparing and queue reviewable proposals."""
    from uuid import UUID, uuid4

    from app.schemas.job_analysis import CreateAnalysis, RunAnalysis
    from app.services import job_analyses
    from app.services.lead_capture import capture_complete_source

    requested_status = await db.scalar(
        select(ApplicationStatus).where(
            ApplicationStatus.id == data.status_id,
            or_(
                ApplicationStatus.user_id == user.id,
                ApplicationStatus.user_id.is_(None),
            ),
        )
    )
    if requested_status is None:
        raise HTTPException(400, "Invalid status")
    today = get_user_local_today(user, x_timezone=x_timezone)
    validate_response_date(data.response_evidence, today)
    if data.text:
        text = capture_complete_source(data.text)["source_text"]
    else:
        text = capture_complete_source(html=await fetch_job_posting_html(data.url))[
            "source_text"
        ]
    if not text or len(text) > 100000:
        raise HTTPException(422, "Posting text must contain 1–100000 characters")
    selected_status = await db.scalar(
        select(ApplicationStatus)
        .where(
            ApplicationStatus.meaning == "preparing",
            or_(
                ApplicationStatus.user_id == user.id,
                ApplicationStatus.user_id.is_(None),
            ),
        )
        .order_by(ApplicationStatus.user_id.desc())
        .limit(1)
    )
    if selected_status is None:
        raise HTTPException(409, "Preparing status is unavailable")
    existing = await recover_create(
        db,
        Application,
        idempotency_key,
        user.id,
        {"job_url": data.url or None, "source_text": text},
    )
    if existing is not None:
        await db.refresh(existing, ["status"])
        return existing
    application = Application(
        **({"id": str(idempotency_key)} if idempotency_key else {}),
        user_id=user.id,
        company="",
        job_title="",
        job_url=data.url or None,
        source_text=text,
        status_id=selected_status.id,
        applied_at=None,
        requirements_must_have=[],
        requirements_nice_to_have=[],
        skills=[],
    )
    db.add(application)
    await db.flush()
    db.add(initial_evidence(application, selected_status, applied_at_provided=False))
    for key, value in response_values(data.response_evidence, today).items():
        setattr(application, key, value)
    analysis = await job_analyses.create(
        db,
        user.id,
        CreateAnalysis(
            kind="EXTRACTION",
            application_id=UUID(application.id),
            language=(user.settings or {}).get("language", "en"),
        ),
    )
    await job_analyses.start(
        db,
        _,
        analysis,
        RunAnalysis(intent_id=uuid4(), expected_revision=analysis.revision),
    )
    await db.commit()
    await db.refresh(application, ["status"])
    return ApplicationListItem.model_validate(application).model_copy(
        update={"pending_analysis_id": analysis.id}
    )


@router.get("/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("applications:read")),
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    return application


@router.patch("/{application_id}", response_model=ApplicationListItem)
async def update_application(
    application_id: str,
    data: ApplicationUpdate,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("applications:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    selected_status = None
    if data.status_id:
        result = await db.execute(
            select(ApplicationStatus).where(
                ApplicationStatus.id == data.status_id,
                or_(
                    ApplicationStatus.user_id == user.id,
                    ApplicationStatus.user_id.is_(None),
                ),
            )
        )
        selected_status = result.scalars().first()
        if not selected_status:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status"
            )

    old_status_id = application.status_id
    update_data = data.model_dump(
        exclude_unset=True,
        exclude={
            "response_evidence",
            "expected_revision",
            "archived",
            "status_changed_at",
            "status_comment",
            "status_reason",
        },
    )
    status_changed = "status_id" in update_data and data.status_id != old_status_id
    await job_links(db, user.id, update_data, application)
    if data.archived is not None:
        update_data["archived_at"] = datetime.now(UTC) if data.archived else None
    destination = (
        selected_status.meaning if selected_status else application.status_meaning
    )
    for field in ("company", "job_title"):
        if field in update_data and not update_data[field].strip():
            if destination != "preparing":
                raise HTTPException(422, "Company and position are required")
            update_data[field] = ""
    if (
        "applied_at" in update_data
        and update_data["applied_at"] is None
        and destination != "preparing"
    ):
        raise HTTPException(422, "Only Preparing can have no applied date")
    if (
        status_changed
        and application.status_meaning == "preparing"
        and destination != "preparing"
        and (
            not update_data.get("company", application.company)
            or not update_data.get("job_title", application.job_title)
            or not (data.applied_at or application.applied_at)
        )
    ):
        raise HTTPException(
            422, "Set company, position and applied date before sending"
        )
    if status_changed:
        update_data["outcome_reason"] = (
            data.status_reason if destination in ("rejected", "withdrawn") else None
        )

    if "response_evidence" in data.model_fields_set:
        update_data.update(
            response_values(
                data.response_evidence,
                get_user_local_today(user, x_timezone=x_timezone),
                application,
            )
        )
    if status_changed and selected_status is not None:
        update_data.update(
            status_meaning=selected_status.meaning, status_meaning_provenance="recorded"
        )

    try:
        if update_data:
            await compare_and_set_application(
                db, application, update_data, data.expected_revision
            )
        if status_changed:
            db.add(
                ApplicationStatusHistory(
                    application_id=application_id,
                    changed_at=data.status_changed_at or datetime.now(UTC),
                    note=data.status_comment,
                    reason=data.status_reason
                    if destination in ("rejected", "withdrawn")
                    else None,
                    from_status_id=old_status_id,
                    to_status_id=data.status_id,
                    from_meaning=application.status_meaning,
                    from_meaning_provenance=application.status_meaning_provenance,
                    to_meaning=selected_status.meaning
                    if selected_status
                    else "unknown",
                    to_meaning_provenance="recorded",
                    time_provenance="recorded",
                )
            )
        if update_data.get("recruiter_contact_id"):
            link = await db.scalar(
                select(ApplicationContact.id).where(
                    ApplicationContact.user_id == user.id,
                    ApplicationContact.application_id == application.id,
                    ApplicationContact.contact_id
                    == update_data["recruiter_contact_id"],
                )
            )
            if not link:
                db.add(
                    ApplicationContact(
                        user_id=user.id,
                        application_id=application.id,
                        contact_id=update_data["recruiter_contact_id"],
                    )
                )
        await audit(db, user.id, "application.updated", application)
        await db.commit()
    except BaseException:
        await db.rollback()
        raise

    if status_changed:
        await record_streak_activity(user=user, db=db, x_timezone=x_timezone)

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
        .execution_options(populate_existing=True)
    )
    return result.scalars().first()


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(
    application_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("applications:write")),
    db: AsyncSession = Depends(get_db),
):
    await lock_ai_settings(db)
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    await db.delete(application)
    await db.commit()


def check_document_revision(application: Application, expected: int | None) -> None:
    if expected is not None and application.evidence_revision != expected:
        raise HTTPException(
            409, "Documents changed. Reload and review before retrying."
        )


@router.post("/{application_id}/cv", response_model=ApplicationListItem)
async def upload_cv(
    application_id: str,
    file: UploadFile,
    expected_evidence_revision: int | None = Header(default=None, ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("files:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Read file content
    max_size = settings.max_document_size_mb * 1024 * 1024
    content = await file.read(max_size + 1)
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_document_size_mb}MB",
        )

    # Write to temp file for magic byte validation
    import tempfile

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
        file_path = store_file(content, upload_dir)
    finally:
        tmp_path.unlink(missing_ok=True)

    await lock_ai_settings(db)
    await db.refresh(application)
    check_document_revision(application, expected_evidence_revision)
    await invalidate_interviews(
        db,
        application_id=application_id,
        removed=bool(application.cv_path or application.cv_text),
    )
    application.evidence_revision += 1
    application.cv_text = None
    application.cv_path = file_path
    application.cv_original_filename = sanitize_filename(file.filename or "unnamed")
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
    expected_evidence_revision: int | None = Header(default=None, ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("files:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    # Note: We don't delete CAS files as they may be shared/deduplicated
    await lock_ai_settings(db)
    await db.refresh(application)
    check_document_revision(application, expected_evidence_revision)
    await invalidate_interviews(db, application_id=application_id, removed=True)
    application.evidence_revision += 1
    application.cv_text = None
    application.cv_path = None
    application.cv_original_filename = None
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
    expected_evidence_revision: int | None = Header(default=None, ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("files:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Read file content
    max_size = settings.max_document_size_mb * 1024 * 1024
    content = await file.read(max_size + 1)
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_document_size_mb}MB",
        )

    # Write to temp file for magic byte validation
    import tempfile

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
        file_path = store_file(content, upload_dir)
    finally:
        tmp_path.unlink(missing_ok=True)

    await lock_ai_settings(db)
    await db.refresh(application)
    check_document_revision(application, expected_evidence_revision)
    await invalidate_interviews(
        db,
        application_id=application_id,
        removed=bool(application.cover_letter_path or application.cover_letter_text),
    )
    application.evidence_revision += 1
    application.cover_letter_text = None
    application.cover_letter_path = file_path
    application.cover_letter_original_filename = sanitize_filename(
        file.filename or "unnamed"
    )
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
    expected_evidence_revision: int | None = Header(default=None, ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("files:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    # Note: We don't delete CAS files as they may be shared/deduplicated
    await lock_ai_settings(db)
    await db.refresh(application)
    check_document_revision(application, expected_evidence_revision)
    await invalidate_interviews(db, application_id=application_id, removed=True)
    application.evidence_revision += 1
    application.cover_letter_text = None
    application.cover_letter_path = None
    application.cover_letter_original_filename = None
    await db.commit()

    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .options(selectinload(Application.status))
    )
    return result.scalars().first()
