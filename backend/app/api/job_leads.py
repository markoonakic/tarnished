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

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_by_api_token
from app.models import User
from app.models.job_lead import JobLead
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
HTTP_USER_AGENT = "Mozilla/5.0 (compatible; JobTrackerBot/1.0)"


@router.get("", response_model=JobLeadListResponse)
async def list_job_leads(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List job leads for the authenticated user with pagination.

    Args:
        page: Page number (1-indexed).
        per_page: Items per page (max 100).
        status_filter: Optional status filter (pending, extracted, failed).
        user: The authenticated user.
        db: Database session.

    Returns:
        Paginated list of job leads.
    """
    query = select(JobLead).where(JobLead.user_id == user.id)

    if status_filter:
        query = query.where(JobLead.status == status_filter)

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

    # Step 1: Fetch HTML content (use provided HTML or fetch from URL)
    if data.html:
        html_content = data.html
        logger.debug(f"Using provided HTML content ({len(html_content)} chars)")
    else:
        html_content = await _fetch_html(url)
        logger.debug(f"Fetched HTML content ({len(html_content)} chars)")

    # Step 2: Extract job data using AI
    try:
        extracted = await extract_job_data(html_content, url)
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
