"""Insights API router for AI-powered analytics insights."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_request_time_zone, require_api_key_scope
from app.models import User
from app.schemas.insights import GraceInsights, InsightsRequest
from app.services.ai_settings import get_ai_settings
from app.services.analytics_queries import (
    analytics_clock,
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
    except Exception:
        logger.warning("Failed to check AI configuration")
        return {"configured": False}


@router.post("/insights", response_model=GraceInsights)
async def get_insights(
    request: InsightsRequest,
    x_timezone: str | None = Depends(get_request_time_zone),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    __: object = Depends(require_api_key_scope("analytics:generate")),
):
    """Generate only on an explicit authorized request; reads never generate."""
    try:
        period = _normalize_period(request.period)
        instant, zone = analytics_clock(current_user, x_timezone, request.as_of)
        analytics = await _get_analytics_for_insights(
            db,
            current_user.id,
            period,
            as_of=instant,
            time_zone=zone,
        )
        settings = await get_ai_settings(db)

        insights = await generate_insights_async(
            settings,
            analytics.get("pipeline_overview", {}),
            analytics.get("interview_analytics", {}),
            analytics.get("activity_tracking", {}),
            period,
            **(
                {"output_language": "sr-Latn"}
                if (current_user.settings or {}).get("language") == "sr-Latn"
                else {}
            ),
        )

        return insights

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500, detail="Failed to generate insights"
        ) from None


async def _get_analytics_for_insights(
    db: AsyncSession,
    user_id: str,
    period: str,
    *,
    today=None,
    as_of=None,
    time_zone="UTC",
) -> dict:
    """Get analytics data formatted for insights generation."""
    pipeline_overview = await get_pipeline_overview_data(
        db,
        user_id,
        period,
        today=today,
        as_of=as_of,
        time_zone=time_zone,
    )
    interview_analytics = await get_interview_rounds_data(
        db,
        user_id,
        period,
        today=today,
        as_of=as_of,
        time_zone=time_zone,
        calculation=pipeline_overview,
    )
    activity_tracking = await get_activity_tracking_data(
        db,
        user_id,
        period,
        today=today,
        as_of=as_of,
        time_zone=time_zone,
        calculation=pipeline_overview,
    )

    return {
        "pipeline_overview": pipeline_overview,
        "interview_analytics": interview_analytics,
        "activity_tracking": activity_tracking,
    }
