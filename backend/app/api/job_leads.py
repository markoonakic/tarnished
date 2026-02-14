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

from fastapi import APIRouter, Depends, HTTPException
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
from app.services.extraction import extract_job_data

router = APIRouter(prefix="/api/job-leads", tags=["job-leads"])
