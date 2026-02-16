"""Insights API router for AI-powered analytics insights."""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import decrypt_api_key
from app.models import SystemSettings, User
from app.schemas.insights import GraceInsights, InsightsRequest
from app.services.insights import generate_insights

logger = logging.getLogger(__name__)

router = APIRouter()

# Thread pool for running sync AI operations
_executor = ThreadPoolExecutor(max_workers=4)

settings = get_settings()

# Module-level sync engine (lazy initialization)
_sync_engine = None


def _get_sync_engine():
    """Get or create the sync database engine (lazy initialization)."""
    global _sync_engine
    if _sync_engine is None:
        sync_url = settings.database_url
        if "+aiosqlite" in sync_url:
            sync_url = sync_url.replace("+aiosqlite", "")
        elif "+asyncpg" in sync_url:
            sync_url = sync_url.replace("+asyncpg", "+psycopg2")
        _sync_engine = create_engine(sync_url)
    return _sync_engine


def _get_sync_session() -> SyncSession:
    """Create a sync database session for use in thread pool."""
    return SyncSession(bind=_get_sync_engine())


def _generate_insights_sync(
    pipeline_data: dict,
    interview_data: dict,
    activity_data: dict,
    period: str,
) -> GraceInsights:
    """Sync wrapper for generate_insights that creates its own session."""
    sync_session = _get_sync_session()
    try:
        return generate_insights(
            db=sync_session,
            pipeline_data=pipeline_data,
            interview_data=interview_data,
            activity_data=activity_data,
            period=period,
        )
    finally:
        sync_session.close()


@router.get("/insights/configured")
async def is_ai_configured(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),  # Add authentication
):
    """Check if AI is configured for insights generation."""
    try:
        result = await db.execute(
            select(SystemSettings).where(
                SystemSettings.key == SystemSettings.KEY_LITELLM_API_KEY
            )
        )
        setting = result.scalars().first()

        if not setting or not setting.value:
            return {"configured": False}

        try:
            api_key = decrypt_api_key(setting.value)
            return {"configured": bool(api_key)}
        except Exception as e:
            logger.exception("Failed to decrypt API key: %s", e)
            return {"configured": False}
    except Exception as e:
        logger.exception("Failed to check AI configuration: %s", e)
        return {"configured": False}


@router.post("/insights", response_model=GraceInsights)
async def get_insights(
    request: InsightsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate AI-powered insights for analytics data."""
    try:
        # TODO: Fetch analytics data - will be implemented in Task 4
        analytics = await _get_analytics_for_insights(db, current_user.id, request.period)

        # Run sync AI generation in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        insights = await loop.run_in_executor(
            _executor,
            _generate_insights_sync,
            analytics.get("pipeline_overview", {}),
            analytics.get("interview_analytics", {}),
            analytics.get("activity_tracking", {}),
            request.period,
        )

        return insights

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {e}")


async def _get_analytics_for_insights(
    db: AsyncSession, user_id: str, period: str
) -> dict:
    """Get analytics data formatted for insights generation.

    Placeholder - will be implemented in Task 4.
    """
    return {
        "pipeline_overview": {},
        "interview_analytics": {},
        "activity_tracking": {},
    }
