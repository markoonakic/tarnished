"""Insights API router for AI-powered analytics insights."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_api_key_scope
from app.models import User
from app.schemas.insights import GraceInsights, InsightsRequest
from app.services.ai_settings import get_ai_settings
from app.services.analytics_queries import (
    get_activity_tracking_data,
    get_interview_rounds_data,
    get_pipeline_overview_data,
)
from app.services.insights import generate_insights_async

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_PERIODS = {"7d", "30d", "3m", "all"}


def _normalize_period(period: str) -> str:
    return period if period in VALID_PERIODS else "30d"


@router.get("/insights/configured")
async def is_ai_configured(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),  # Add authentication
    __: object = Depends(require_api_key_scope("analytics:read")),
):
    """Check if AI is configured for insights generation."""
    try:
        settings = await get_ai_settings(db)
        return {"configured": settings.is_configured}
    except Exception as e:
        logger.exception("Failed to check AI configuration: %s", e)
        return {"configured": False}


@router.post("/insights", response_model=GraceInsights)
async def get_insights(
    request: InsightsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
):
    """Generate AI-powered insights for analytics data."""
    try:
        period = _normalize_period(request.period)
        analytics = await _get_analytics_for_insights(db, current_user.id, period)
        settings = await get_ai_settings(db)

        insights = await generate_insights_async(
            settings,
            analytics.get("pipeline_overview", {}),
            analytics.get("interview_analytics", {}),
            analytics.get("activity_tracking", {}),
            period,
        )

        return insights

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {e}")


async def _get_analytics_for_insights(
    db: AsyncSession, user_id: str, period: str
) -> dict:
    """Get analytics data formatted for insights generation."""
    pipeline_overview = await get_pipeline_overview_data(db, user_id, period)
    interview_analytics = await get_interview_rounds_data(db, user_id, period)
    activity_tracking = await get_activity_tracking_data(db, user_id, period)

    return {
        "pipeline_overview": pipeline_overview,
        "interview_analytics": {
            "conversion_rates": interview_analytics["conversion_rates"],
            "outcomes": interview_analytics["outcomes"],
            "avg_days_between_rounds": interview_analytics["avg_days_between_rounds"],
            "speed_indicators": interview_analytics["speed_indicators"],
        },
        "activity_tracking": {
            "weekly_applications": activity_tracking["weekly_applications"],
            "weekly_interviews": activity_tracking["weekly_interviews"],
            "patterns": activity_tracking["patterns"],
            "active_days": activity_tracking["active_days"],
        },
    }
