"""Job Leads API router.

This module provides API endpoints for managing job leads, including:
- Creating new job leads from URLs (with AI-powered extraction)
- Listing and filtering job leads
- Viewing job lead details
- Converting job leads to applications
- Deleting job leads

The API supports both web app authentication (Bearer token) and
browser extension authentication (API token).
"""

import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_by_api_token, get_current_user_flexible
from app.core.security import decrypt_api_key
from app.models import SystemSettings, User
from app.models.application import Application
from app.models.job_lead import JobLead
from app.models.status import ApplicationStatus
from app.schemas.application import ApplicationListItem
from app.schemas.job_lead import (
    JobLeadCreate,
    JobLeadListResponse,
    JobLeadListItem,
    JobLeadResponse,
)
from app.services.extraction import (
    extract_job_data,
    ExtractionError,
    ExtractionTimeoutError,
    ExtractionInvalidResponseError,
    NoJobFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/job-leads", tags=["job-leads"])

# HTTP client settings for fetching job posting URLs
HTTP_TIMEOUT_SECONDS = 30
HTTP_MAX_REDIRECTS = 5
HTTP_USER_AGENT = "Mozilla/5.0 (compatible; TarnishedBot/1.0)"


async def _get_ai_settings(db: AsyncSession) -> tuple[str | None, str | None, str | None]:
    """Get AI settings from the database.

    Returns:
        Tuple of (model, api_key, api_base) - all may be None if not configured.
    """
    # Fetch all AI settings in one query
    result = await db.execute(
        select(SystemSettings).where(
            SystemSettings.key.in_([
                SystemSettings.KEY_LITELLM_MODEL,
                SystemSettings.KEY_LITELLM_API_KEY,
                SystemSettings.KEY_LITELLM_BASE_URL,
            ])
        )
    )
    settings = {s.key: s.value for s in result.scalars().all()}

    # Get model
    model = settings.get(SystemSettings.KEY_LITELLM_MODEL)

    # Decrypt API key if present
    api_key = None
    encrypted_key = settings.get(SystemSettings.KEY_LITELLM_API_KEY)
    if encrypted_key:
        api_key = decrypt_api_key(encrypted_key)

    # Get base URL
    api_base = settings.get(SystemSettings.KEY_LITELLM_BASE_URL)

    return model, api_key, api_base


@router.get("", response_model=JobLeadListResponse)
async def list_job_leads(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None, description="Search by URL (exact match)"),
    user: User = Depends(get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """List job leads for the authenticated user with pagination.

    Args:
        page: Page number (1-indexed).
        per_page: Items per page (max 100).
        status_filter: Optional status filter (pending, extracted, failed).
        search: Optional URL search (exact match, used by extension to check existing leads).
        user: The authenticated user.
        db: Database session.

    Returns:
        Paginated list of job leads.
    """
    query = select(JobLead).where(JobLead.user_id == user.id)

    if status_filter:
        query = query.where(JobLead.status == status_filter)

    # Search by exact URL match (used by extension to check for existing leads)
    if search:
        query = query.where(JobLead.url == search)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Order by most recent first, then apply pagination
    query = query.order_by(JobLead.scraped_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    job_leads = result.scalars().all()

    return JobLeadListResponse(
        items=job_leads,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{job_lead_id}", response_model=JobLeadResponse)
async def get_job_lead(
    job_lead_id: str,
    user: User = Depends(get_current_user),
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


@router.post("", response_model=JobLeadResponse, status_code=status.HTTP_201_CREATED)
async def create_job_lead(
    data: JobLeadCreate,
    user: User = Depends(get_current_user_by_api_token),
    db: AsyncSession = Depends(get_db),
):
    """Create a new job lead by extracting data from a job posting URL.

    This endpoint:
    1. Fetches HTML content from the provided URL
    2. Uses AI to extract structured job data from the HTML
    3. Creates a JobLead record in the database

    The endpoint supports both Bearer token and X-API-Key authentication
    for use with browser extensions.

    Args:
        data: JobLeadCreate schema with url (required) and optional html content.
        user: The authenticated user (via API token).
        db: Database session.

    Returns:
        The created JobLead record with extracted data.

    Raises:
        HTTPException: 400 for invalid/extraction failures, 502 for fetch failures.
    """
    url = data.url
    logger.info(f"Creating job lead for URL: {url} (user: {user.id})")

    # Check for existing job lead with same URL for this user
    result = await db.execute(
        select(JobLead).where(
            JobLead.user_id == user.id,
            JobLead.url == url,
        )
    )
    existing = result.scalars().first()
    if existing:
        logger.info(f"Duplicate job lead URL detected: {url} (existing ID: {existing.id})")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A job lead already exists for this URL. ID: {existing.id}",
        )

    # Step 1: Get content for extraction
    # Prefer text (direct from extension), fall back to HTML, then fetch from URL
    if data.text:
        logger.debug(f"Using provided text content ({len(data.text)} chars)")
        html_content = None
        text_content = data.text
    elif data.html:
        logger.debug(f"Using provided HTML content ({len(data.html)} chars)")
        html_content = data.html
        text_content = None
    else:
        html_content = await _fetch_html(url)
        logger.debug(f"Fetched HTML content ({len(html_content)} chars)")
        text_content = None

    # Step 2: Extract job data using AI
    # Get AI settings from database
    ai_model, ai_api_key, ai_api_base = await _get_ai_settings(db)

    try:
        extracted = await extract_job_data(
            html=html_content,
            text=text_content,
            url=url,
            model=ai_model,
            api_key=ai_api_key,
            api_base=ai_api_base,
        )
    except ExtractionTimeoutError as e:
        logger.error(f"Extraction timeout for {url}: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Job data extraction timed out. Please try again later.",
        )
    except NoJobFoundError as e:
        logger.warning(f"No job found at {url}: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract job posting data from the provided URL. "
            "Please ensure the URL points to a valid job posting.",
        )
    except ExtractionInvalidResponseError as e:
        logger.error(f"Invalid extraction response for {url}: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to extract job data due to an AI service error. Please try again later.",
        )
    except ExtractionError as e:
        logger.error(f"Extraction error for {url}: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to extract job data: {e.message}",
        )

    # Step 3: Create JobLead record
    job_lead = JobLead(
        user_id=user.id,
        url=url,
        status="extracted",
        title=extracted.title,
        company=extracted.company,
        description=extracted.description,
        location=extracted.location,
        salary_min=extracted.salary_min,
        salary_max=extracted.salary_max,
        salary_currency=extracted.salary_currency,
        recruiter_name=extracted.recruiter_name,
        recruiter_title=extracted.recruiter_title,
        recruiter_linkedin_url=extracted.recruiter_linkedin_url,
        requirements_must_have=extracted.requirements_must_have,
        requirements_nice_to_have=extracted.requirements_nice_to_have,
        skills=extracted.skills,
        years_experience_min=extracted.years_experience_min,
        years_experience_max=extracted.years_experience_max,
        source=extracted.source,
        posted_date=extracted.posted_date,
    )

    db.add(job_lead)
    await db.commit()
    await db.refresh(job_lead)

    logger.info(
        f"Created job lead {job_lead.id}: {job_lead.title} at {job_lead.company}"
    )

    return job_lead


async def _fetch_html(url: str) -> str:
    """Fetch HTML content from a URL.

    Args:
        url: The URL to fetch.

    Returns:
        HTML content as a string.

    Raises:
        HTTPException: If the fetch fails (timeout, 404, etc.).
    """
    headers = {
        "User-Agent": HTTP_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    async with httpx.AsyncClient(
        timeout=HTTP_TIMEOUT_SECONDS,
        follow_redirects=True,
        max_redirects=HTTP_MAX_REDIRECTS,
    ) as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
        except httpx.TimeoutException:
            logger.warning(f"Timeout fetching URL: {url}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="The job posting URL timed out. Please try again later.",
            )
        except httpx.TooManyRedirects:
            logger.warning(f"Too many redirects for URL: {url}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The URL has too many redirects. Please provide a direct job posting URL.",
            )
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            logger.warning(f"HTTP error {status_code} for URL: {url}")
            if status_code == 404:
                detail = "The job posting was not found (404). It may have been removed."
            elif status_code == 403:
                detail = "Access to the job posting was denied (403). The page may require authentication."
            elif status_code >= 500:
                detail = f"The job posting server returned an error ({status_code}). Please try again later."
            else:
                detail = f"Failed to fetch job posting (HTTP {status_code})."
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            )
        except httpx.RequestError as e:
            logger.error(f"Request error for URL {url}: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to fetch the job posting URL: {str(e)}",
            )

        # Validate content type
        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
            logger.warning(f"Non-HTML content type for URL {url}: {content_type}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The URL does not point to an HTML page. Please provide a job posting URL.",
            )

        return response.text


@router.post("/{job_lead_id}/retry", response_model=JobLeadResponse)
async def retry_job_lead_extraction(
    job_lead_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retry extraction for a failed job lead.

    This endpoint:
    1. Finds the job lead by ID and verifies it belongs to the user
    2. Verifies the job lead has status "failed"
    3. Re-fetches HTML content from the URL
    4. Re-runs extraction with fresh data
    5. Updates the job lead with new extracted data
    6. Sets status to "extracted" on success or "failed" on error

    Args:
        job_lead_id: The UUID of the job lead to retry.
        user: The authenticated user.
        db: Database session.

    Returns:
        The updated JobLead record with new extraction data.

    Raises:
        HTTPException: 404 if job lead not found or doesn't belong to user,
                     400 if job lead status is not "failed".
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

    # Step 2: Verify the job lead has status "failed"
    if job_lead.status != "failed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job lead must have status 'failed' to retry",
        )

    logger.info(f"Retrying extraction for job lead {job_lead_id}: {job_lead.title or 'Untitled'}")

    try:
        # Step 3: Re-fetch HTML content from the URL
        html_content = await _fetch_html(job_lead.url)
        logger.debug(f"Re-fetched HTML content ({len(html_content)} chars)")

        # Step 4: Extract job data using AI
        # Get AI settings from database
        ai_model, ai_api_key, ai_api_base = await _get_ai_settings(db)

        try:
            extracted = await extract_job_data(
                html_content,
                job_lead.url,
                model=ai_model,
                api_key=ai_api_key,
                api_base=ai_api_base,
            )
            logger.info(f"Successfully re-extracted job: {extracted.title} at {extracted.company}")
        except ExtractionTimeoutError as e:
            logger.error(f"Extraction timeout for {job_lead.url}: {e.message}")
            # Update job lead status to failed with error
            job_lead.status = "failed"
            job_lead.error_message = "Job data extraction timed out. Please try again later."
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Job data extraction timed out. Please try again later.",
            )
        except NoJobFoundError as e:
            logger.warning(f"No job found at {job_lead.url}: {e.message}")
            # Update job lead status to failed with error
            job_lead.status = "failed"
            job_lead.error_message = "Could not extract job posting data. Please ensure the URL points to a valid job posting."
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract job posting data from the provided URL. "
                "Please ensure the URL points to a valid job posting.",
            )
        except ExtractionInvalidResponseError as e:
            logger.error(f"Invalid extraction response for {job_lead.url}: {e.message}")
            # Update job lead status to failed with error
            job_lead.status = "failed"
            job_lead.error_message = "Failed to extract job data due to an AI service error. Please try again later."
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to extract job data due to an AI service error. Please try again later.",
            )
        except ExtractionError as e:
            logger.error(f"Extraction error for {job_lead.url}: {e.message}")
            # Update job lead status to failed with error
            job_lead.status = "failed"
            job_lead.error_message = f"Failed to extract job data: {e.message}"
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to extract job data: {e.message}",
            )

        # Step 5: Update job lead fields with new extraction
        job_lead.status = "extracted"
        job_lead.error_message = None  # Clear any previous error

        # Update all fields that might have changed
        job_lead.title = extracted.title
        job_lead.company = extracted.company
        job_lead.description = extracted.description
        job_lead.location = extracted.location
        job_lead.salary_min = extracted.salary_min
        job_lead.salary_max = extracted.salary_max
        job_lead.salary_currency = extracted.salary_currency
        job_lead.recruiter_name = extracted.recruiter_name
        job_lead.recruiter_title = extracted.recruiter_title
        job_lead.recruiter_linkedin_url = extracted.recruiter_linkedin_url
        job_lead.requirements_must_have = extracted.requirements_must_have
        job_lead.requirements_nice_to_have = extracted.requirements_nice_to_have
        job_lead.skills = extracted.skills
        job_lead.years_experience_min = extracted.years_experience_min
        job_lead.years_experience_max = extracted.years_experience_max
        job_lead.source = extracted.source
        job_lead.posted_date = extracted.posted_date
        job_lead.scraped_at = datetime.utcnow()  # Update timestamp

        await db.commit()
        await db.refresh(job_lead)

        logger.info(
            f"Successfully re-extracted job lead {job_lead.id}: {job_lead.title} at {job_lead.company}"
        )

        return job_lead

    except HTTPException:
        # Re-raise HTTP exceptions from fetch/extract
        raise
    except Exception as e:
        logger.error(f"Unexpected error during retry for job lead {job_lead_id}: {e}")
        # Update job lead status to failed with error
        job_lead.status = "failed"
        job_lead.error_message = f"Unexpected error during retry: {str(e)}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during retry. Please try again.",
        )


@router.delete("/{job_lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job_lead(
    job_lead_id: str,
    user: User = Depends(get_current_user),
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


@router.post("/{job_lead_id}/convert", response_model=ApplicationListItem, status_code=status.HTTP_201_CREATED)
async def convert_job_lead_to_application(
    job_lead_id: str,
    user: User = Depends(get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """Convert a job lead to an application.

    This endpoint:
    1. Finds the job lead by ID and verifies it belongs to the user
    2. Verifies the job lead has status "extracted" and hasn't been converted yet
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
                     400 if job lead status is not "extracted" or already converted.
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

    # Step 2: Verify the job lead has status "extracted" and hasn't been converted yet
    if job_lead.status != "extracted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job lead must have status 'extracted' to convert",
        )

    if job_lead.converted_to_application_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job lead has already been converted to an application",
        )

    logger.info(f"Converting job lead {job_lead_id} to application: {job_lead.title} at {job_lead.company}")

    # Step 3: Get the user's default status (or first user status, or first default status)
    from sqlalchemy import or_
    status_result = await db.execute(
        select(ApplicationStatus)
        .where(
            or_(
                ApplicationStatus.user_id == user.id,
                ApplicationStatus.user_id.is_(None),
            )
        )
        .order_by(ApplicationStatus.user_id.desc().nulls_last(), ApplicationStatus.order)
        .limit(1)
    )
    default_status = status_result.scalars().first()

    if not default_status:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No application status found. Please create at least one status.",
        )

    # Step 4: Create an Application from the job lead data
    application = Application(
        user_id=user.id,
        company=job_lead.company,
        job_title=job_lead.title,
        job_url=job_lead.url,
        job_lead_id=job_lead.id,
        status_id=default_status.id,
        applied_at=datetime.utcnow().date(),
        # Rich extraction fields
        description=job_lead.description,
        location=job_lead.location,
        salary_min=job_lead.salary_min,
        salary_max=job_lead.salary_max,
        salary_currency=job_lead.salary_currency,
        recruiter_name=job_lead.recruiter_name,
        recruiter_title=job_lead.recruiter_title,
        recruiter_linkedin_url=job_lead.recruiter_linkedin_url,
        requirements_must_have=job_lead.requirements_must_have or [],
        requirements_nice_to_have=job_lead.requirements_nice_to_have or [],
        skills=job_lead.skills or [],
        years_experience_min=job_lead.years_experience_min,
        years_experience_max=job_lead.years_experience_max,
        source=job_lead.source,
    )

    db.add(application)

    # Flush to get the application ID before committing
    await db.flush()

    # Step 5: Set the job_lead_id on the application (for reference)
    # Note: We keep the job lead until the application is successfully created,
    # then delete it to clean up

    await db.commit()

    # Eagerly load the status relationship before returning
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Application)
        .options(selectinload(Application.status))
        .where(Application.id == application.id)
    )
    application = result.scalars().first()

    # Step 6: Delete the job lead after successful conversion
    await db.delete(job_lead)
    await db.commit()

    logger.info(
        f"Successfully converted job lead to application {application.id}: {application.job_title} at {application.company}"
    )

    return application
