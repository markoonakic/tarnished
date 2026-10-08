"""Job Leads API router.

This module provides API endpoints for managing job leads, including:
- Saving URLs/source independently of explicit AI extraction
- Listing and filtering job leads
- Viewing job lead details
- Converting job leads to applications
- Deleting job leads

The API supports both web app authentication (Bearer token) and
browser extension authentication (API token).
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    get_current_user_flexible,
    get_request_time_zone,
    require_api_key_scope,
    require_api_key_scopes,
)
from app.models import User
from app.models.application import Application
from app.models.job_lead import JobLead
from app.models.workspace import ApplicationContact
from app.schemas.application import ApplicationListItem
from app.schemas.errors import ErrorCode, make_error_response
from app.schemas.job_lead import (
    JobLeadCreate,
    JobLeadEditable,
    JobLeadExtractRequest,
    JobLeadListResponse,
    JobLeadResponse,
    JobLeadUpdate,
)
from app.services.ai_settings import get_ai_settings as get_ai_settings
from app.services.extraction import extract_job_data as extract_job_data
from app.services.job_fetch import fetch_job_posting_html
from app.services.job_filters import JobFilters, apply_filters, filter_params
from app.services.lead_capture import capture_complete_source
from app.services.reference_data import get_initial_application_status
from app.services.user_time import get_user_local_today
from app.services.workspace import JOB_FIELDS, audit, job_links

router = APIRouter(prefix="/api/job-leads", tags=["job-leads"])


def _is_duplicate_job_lead_url_error(exc: IntegrityError) -> bool:
    message = str(getattr(exc, "orig", exc)).lower()
    return "uq_job_leads_user_url" in message or (
        "job_leads.user_id, job_leads.url" in message
    )


@router.get("", response_model=JobLeadListResponse)
async def list_job_leads(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None, description="Search by company, title, or URL"),
    source: str | None = Query(None, description="Filter by exact source"),
    sort: str = Query("newest", pattern="^(newest|oldest)$"),
    filters: JobFilters = Depends(filter_params),
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("job_leads:read")),
    db: AsyncSession = Depends(get_db),
):
    """List job leads for the authenticated user with pagination.

    Args:
        page: Page number (1-indexed).
        per_page: Items per page (max 100).
        status_filter: Optional status filter (pending, extracted, failed).
        search: Optional text search across company, title, and URL.
        source: Optional exact source filter.
        sort: Sort order by scraped date.
        user: The authenticated user.
        db: Database session.

    Returns:
        Paginated list of job leads.
    """
    query = apply_filters(
        select(JobLead).where(JobLead.user_id == user.id),
        JobLead,
        filters,
        date_from,
        date_to,
    )

    if status_filter:
        query = query.where(JobLead.status == status_filter)

    if source:
        query = query.where(JobLead.source == source)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                JobLead.url.ilike(search_term),
                JobLead.company.ilike(search_term),
                JobLead.title.ilike(search_term),
            )
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    if sort == "oldest":
        query = query.order_by(JobLead.scraped_at.asc())
    else:
        query = query.order_by(JobLead.scraped_at.desc())

    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    job_leads = result.scalars().all()

    return JobLeadListResponse(
        items=job_leads,  # type: ignore[arg-type]
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/sources")
async def list_job_lead_sources(
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("job_leads:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobLead.source)
        .where(JobLead.user_id == user.id, JobLead.source.is_not(None))
        .distinct()
        .order_by(JobLead.source.asc())
    )
    sources = [source for source in result.scalars().all() if source]
    return {"sources": sources}


@router.get("/{job_lead_id}", response_model=JobLeadResponse)
async def get_job_lead(
    job_lead_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("job_leads:read")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single job lead by ID.

    Args:
        job_lead_id: The UUID of the job lead.
        user: The authenticated user.
        db: Database session.

    Returns:
        The job lead details.

    Raises:
        HTTPException: 404 if job lead not found or doesn't belong to user.
    """
    result = await db.execute(
        select(JobLead).where(
            JobLead.id == job_lead_id,
            JobLead.user_id == user.id,
        )
    )
    job_lead = result.scalars().first()

    if not job_lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job lead not found",
        )

    return job_lead


async def _owned_lead(db: AsyncSession, lead_id: str, user_id: str) -> JobLead:
    lead = await db.scalar(
        select(JobLead)
        .where(JobLead.id == lead_id, JobLead.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    if lead is None:
        raise HTTPException(404, "Job lead not found")
    return lead


def _conflict(lead_id: str) -> HTTPException:
    return HTTPException(
        409,
        {
            "id": lead_id,
            "message": "Job lead changed; reload before retrying. This request did not update the lead.",
        },
    )


async def _duplicate(db: AsyncSession, user_id: str, url: str | None) -> None:
    if not url:
        return
    existing_id = await db.scalar(
        select(JobLead.id).where(JobLead.user_id == user_id, JobLead.url == url)
    )
    if existing_id:
        raise HTTPException(
            409,
            {
                **make_error_response(
                    ErrorCode.DUPLICATE_RESOURCE,
                    detail=f"A job lead already exists for this URL. ID: {existing_id}",
                    message_override="This job has already been saved",
                ),
                "id": existing_id,
            },
        )


@router.post("", response_model=JobLeadResponse, status_code=status.HTTP_201_CREATED)
async def create_job_lead(
    data: JobLeadCreate,
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("job_leads:write")),
    db: AsyncSession = Depends(get_db),
):
    """Save a URL and bounded source locally. Never fetch or call AI on save."""
    user_id = user.id
    await _duplicate(db, user_id, data.url)
    captured = await run_in_threadpool(capture_complete_source, data.text, data.html)
    values = data.model_dump(exclude={"url", "text", "html"}, exclude_unset=True)
    await job_links(db, user_id, values)
    lead = JobLead(
        user_id=user_id, url=data.url, status="pending", **captured, **values
    )
    db.add(lead)
    try:
        await db.flush()
        await audit(db, user.id, "lead.created", lead)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if _is_duplicate_job_lead_url_error(exc):
            await _duplicate(db, user_id, data.url)
        raise
    await db.refresh(lead)
    return lead


@router.patch("/{job_lead_id}", response_model=JobLeadResponse)
async def update_job_lead(
    job_lead_id: str,
    data: JobLeadUpdate,
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("job_leads:write")),
    db: AsyncSession = Depends(get_db),
):
    """Correct business fields. Omitted fields remain; null clears scalar fields.

    Every supplied business field, including null, is protected from later AI.
    Lists are non-null: use [] to clear. Source snapshots/URL are immutable.
    """
    lead = await _owned_lead(db, job_lead_id, user.id)
    revision = lead.revision
    if revision != data.expected_revision or lead.converted_to_application_id:
        raise _conflict(job_lead_id)
    values = data.model_dump(exclude_unset=True, exclude={"expected_revision"})
    if not values:
        raise HTTPException(422, "Supply at least one editable field")
    try:
        JobLeadEditable.model_validate(
            {
                **{name: getattr(lead, name) for name in JobLeadEditable.model_fields},
                **values,
            }
        )
    except ValidationError as exc:
        raise HTTPException(422, str(exc)) from exc
    if values.get("url") and values["url"] != lead.url:
        await _duplicate(db, user.id, values["url"])
    await job_links(db, user.id, values, lead)
    values["manual_fields"] = sorted(set(lead.manual_fields) | values.keys())
    # An edit invalidates the claim AND clears processing, even if its callback
    # later loses both success and failure CAS checks.
    if lead.status == "processing":
        values.update(
            status="pending",
            processing_started_at=None,
            error_message="Extraction invalidated by manual edits. Its result will not be applied.",
        )
    changed = await db.scalar(
        update(JobLead)
        .where(
            JobLead.id == job_lead_id,
            JobLead.user_id == user.id,
            JobLead.revision == revision,
            JobLead.converted_to_application_id.is_(None),
        )
        .values(**values, revision=revision + 1)
        .returning(JobLead.id)
        .execution_options(synchronize_session=False)
    )
    if changed is None:
        await db.rollback()
        raise _conflict(job_lead_id)
    await audit(db, user.id, "lead.updated", lead)
    await db.commit()
    await db.refresh(lead)
    return lead


async def _extract_lead(job_lead_id, data, auth, db):
    from uuid import UUID, uuid4

    from app.schemas.job_analysis import CreateAnalysis, RunAnalysis
    from app.services import job_analyses
    from app.services.ai_settings import lock_ai_settings

    await lock_ai_settings(db)
    lead = await _owned_lead(db, job_lead_id, auth.user.id)
    if data is None and lead.status != "failed":
        raise HTTPException(
            400,
            "A bodyless retry requires a failed lead; otherwise provide the current revision",
        )
    if lead.status == "processing" and not (data and data.restart_processing):
        raise _conflict(job_lead_id)
    if data and data.expected_revision != lead.revision:
        raise _conflict(job_lead_id)
    if lead.converted_to_application_id:
        raise _conflict(job_lead_id)
    if not lead.source_text and lead.url:
        try:
            html = await fetch_job_posting_html(lead.url)
        except HTTPException as exc:
            lead.status = "failed"
            lead.error_message = (
                "Posting fetch failed; saved source and manual edits are retained."
            )
            lead.revision += 1
            await db.commit()
            raise HTTPException(
                exc.status_code,
                {
                    **make_error_response(
                        ErrorCode.AI_EXTRACTION_FAILED, detail=str(exc.detail)
                    ),
                    "id": lead.id,
                },
            ) from None
        captured = await run_in_threadpool(capture_complete_source, None, html)
        lead.source_text = captured["source_text"]
        lead.source_truncated = captured["source_truncated"]
        lead.content_warning = captured["content_warning"]
        lead.revision += 1
    analysis = await job_analyses.create(
        db,
        auth.user.id,
        CreateAnalysis(
            kind="EXTRACTION",
            lead_id=UUID(lead.id),
            language=(data.language if data else None)
            or (auth.user.settings or {}).get("language", "en"),
        ),
    )
    await job_analyses.start(
        db,
        auth,
        analysis,
        RunAnalysis(intent_id=uuid4(), expected_revision=analysis.revision),
    )
    lead.revision += 1
    lead.status, lead.processing_started_at, lead.error_message = "pending", None, None
    await db.commit()
    await db.refresh(lead)
    return JobLeadResponse.model_validate(lead).model_copy(
        update={"pending_analysis_id": analysis.id}
    )


@router.post("/{job_lead_id}/extract", response_model=JobLeadResponse)
async def extract_job_lead(
    job_lead_id: str,
    data: JobLeadExtractRequest,
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("job_leads:write")),
    db: AsyncSession = Depends(get_db),
):
    """Queue proposals without publishing extracted fields."""
    return await _extract_lead(job_lead_id, data, _, db)


@router.post("/{job_lead_id}/retry", response_model=JobLeadResponse)
async def retry_job_lead_extraction(
    job_lead_id: str,
    data: JobLeadExtractRequest | None = None,
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(require_api_key_scope("job_leads:write")),
    db: AsyncSession = Depends(get_db),
):
    """Explicit retry of the same reviewed proposal workflow."""
    return await _extract_lead(job_lead_id, data, _, db)


@router.delete("/{job_lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job_lead(
    job_lead_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("job_leads:write")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a job lead by ID.

    Args:
        job_lead_id: The UUID of the job lead to delete.
        user: The authenticated user.
        db: Database session.

    Returns:
        204 No Content on success.

    Raises:
        HTTPException: 404 if job lead not found or doesn't belong to user.
    """
    result = await db.execute(
        select(JobLead).where(
            JobLead.id == job_lead_id,
            JobLead.user_id == user.id,
        )
    )
    job_lead = result.scalars().first()

    if not job_lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job lead not found",
        )

    await db.delete(job_lead)
    await db.commit()


@router.post(
    "/{job_lead_id}/convert",
    response_model=ApplicationListItem,
    status_code=status.HTTP_201_CREATED,
)
async def convert_job_lead_to_application(
    job_lead_id: str,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user_flexible),
    _: object = Depends(
        require_api_key_scopes("job_leads:write", "applications:write")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Convert a job lead to an application.

    This endpoint:
    1. Finds the job lead by ID and verifies it belongs to the user
    2. Returns an existing owned result first, otherwise validates manual completeness
    3. Creates an Application from the job lead data
    4. Sets job_lead_id and copies all relevant fields
    5. Marks the job lead as converted

    Args:
        job_lead_id: The UUID of the job lead to convert.
        user: The authenticated user.
        db: Database session.

    Returns:
        The created Application record.

    Raises:
        HTTPException: 404 if job lead not found or doesn't belong to user,
                     400 if required business fields are incomplete.
    """
    # Step 1: Find the job lead and verify it exists and belongs to user
    result = await db.execute(
        select(JobLead).where(
            JobLead.id == job_lead_id,
            JobLead.user_id == user.id,
        )
    )
    job_lead = result.scalars().first()

    if not job_lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job lead not found",
        )

    user_id = user.id
    revision = job_lead.revision
    if job_lead.converted_to_application_id:
        return await _converted_application(
            db, job_lead.converted_to_application_id, user_id
        )
    if not (
        job_lead.title
        and job_lead.title.strip()
        and job_lead.company
        and job_lead.company.strip()
    ):
        raise HTTPException(
            400,
            "Company and title are required to convert; complete them manually or extract first",
        )
    try:
        JobLeadEditable.model_validate(
            {name: getattr(job_lead, name) for name in JobLeadEditable.model_fields}
        )
    except ValidationError as exc:
        raise HTTPException(422, str(exc)) from exc

    # Step 3: Resolve the initial application status visible to this user.
    default_status = await get_initial_application_status(db, user.id)

    if not default_status:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No application status found. Please create at least one status.",
        )

    # Claim conversion in the same transaction as application/history/linkage.
    # A competing writer waits, then loses this CAS without creating an orphan.
    changed = await db.scalar(
        update(JobLead)
        .where(
            JobLead.id == job_lead_id,
            JobLead.user_id == user_id,
            JobLead.revision == revision,
            JobLead.converted_to_application_id.is_(None),
        )
        .values(
            revision=revision + 1,
            status="converted",
            processing_started_at=None,
            error_message=None,
        )
        .returning(JobLead.id)
        .execution_options(synchronize_session=False)
    )
    if changed is None:
        await db.rollback()
        current = await _owned_lead(db, job_lead_id, user_id)
        if current.converted_to_application_id:
            return await _converted_application(
                db, current.converted_to_application_id, user_id
            )
        raise _conflict(job_lead_id)

    # Step 4: Create an Application from the job lead data
    application = Application(
        user_id=user.id,
        company=job_lead.company,
        job_title=job_lead.title,
        job_description=job_lead.description,
        job_url=job_lead.url,
        job_lead_id=job_lead.id,
        status_id=default_status.id,
        applied_at=get_user_local_today(user, x_timezone=x_timezone),
        # Rich extraction fields
        location=job_lead.location,
        salary_min=job_lead.salary_min,
        salary_max=job_lead.salary_max,
        salary_currency=job_lead.salary_currency,
        posted_date=job_lead.posted_date,
        recruiter_name=job_lead.recruiter_name,
        recruiter_title=job_lead.recruiter_title,
        recruiter_linkedin_url=job_lead.recruiter_linkedin_url,
        requirements_must_have=job_lead.requirements_must_have or [],
        requirements_nice_to_have=job_lead.requirements_nice_to_have or [],
        skills=job_lead.skills or [],
        years_experience_min=job_lead.years_experience_min,
        years_experience_max=job_lead.years_experience_max,
        source=job_lead.source,
        source_text=job_lead.source_text,
        confirmed_requirements=job_lead.confirmed_requirements,
        requirements_revision=job_lead.requirements_revision,
        **{field: getattr(job_lead, field) for field in JOB_FIELDS},
    )

    db.add(application)

    # Flush to get the application ID before creating history
    await db.flush()

    from app.services.application_evidence import initial_evidence

    db.add(initial_evidence(application, default_status))
    if application.recruiter_contact_id:
        db.add(
            ApplicationContact(
                user_id=user.id,
                application_id=application.id,
                contact_id=application.recruiter_contact_id,
            )
        )
    await audit(db, user.id, "application.created", application)

    await db.execute(
        update(JobLead)
        .where(JobLead.id == job_lead_id, JobLead.user_id == user_id)
        .values(converted_to_application_id=application.id)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return await _converted_application(db, application.id, user_id)


async def _converted_application(db: AsyncSession, application_id: str, user_id: str):
    application = await db.scalar(
        select(Application)
        .options(selectinload(Application.status))
        .where(Application.id == application_id, Application.user_id == user_id)
    )
    if application is None:
        raise HTTPException(
            409, "Converted application is missing or unavailable to this owner"
        )
    return application
