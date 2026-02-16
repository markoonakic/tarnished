"""Insights API router for AI-powered analytics insights."""

import asyncio
import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, create_engine, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import decrypt_api_key
from app.models import Application, ApplicationStatus, Round, RoundType, SystemSettings, User
from app.schemas.insights import GraceInsights, InsightsRequest
from app.services.insights import generate_insights

logger = logging.getLogger(__name__)

router = APIRouter()

# Thread pool for running sync AI operations
_executor = ThreadPoolExecutor(max_workers=4)

settings = get_settings()

# Module-level sync engine (lazy initialization)
_sync_engine = None

# Far past date for "all time" queries
FAR_PAST_DATE = date(2000, 1, 1)


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

    This function fetches data from the async session, then delegates to a sync helper
    for processing. Returns structured data for the AI insights service.
    """
    today = date.today()

    # Calculate date range based on period
    if period == "7d":
        start_date = today - timedelta(days=7)
    elif period == "30d":
        start_date = today - timedelta(days=30)
    elif period == "3m":
        start_date = today - timedelta(days=90)
    elif period == "all":
        start_date = FAR_PAST_DATE
    else:
        start_date = today - timedelta(days=30)  # Default to 30d

    # Fetch all the data we need using async queries
    # Then process it synchronously for consistency

    # --- Pipeline Overview Data ---
    # Total applications in period
    result = await db.execute(
        select(func.count(Application.id))
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
    )
    total_applications = result.scalar() or 0

    # Interviews (status = Interviewing)
    result = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
            ApplicationStatus.name == "Interviewing",
        )
    )
    interviews = result.scalar() or 0

    # Offers (status = Offer)
    result = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
            ApplicationStatus.name == "Offer",
        )
    )
    offers = result.scalar() or 0

    # Response rate: applications that got any response (not "No Reply" status)
    result = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
            ApplicationStatus.name != "No Reply",
        )
    )
    responded = result.scalar() or 0
    response_rate = (responded / total_applications * 100) if total_applications > 0 else 0

    # Interview rate
    interview_rate = (interviews / total_applications * 100) if total_applications > 0 else 0

    # Active applications (not Rejected or Withdrawn)
    result = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
            ApplicationStatus.name.not_in(["Rejected", "Withdrawn"]),
        )
    )
    active_applications = result.scalar() or 0

    # Stage breakdown - count applications by status
    result = await db.execute(
        select(ApplicationStatus.name, func.count(Application.id).label("count"))
        .join(Application, Application.status_id == ApplicationStatus.id)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
        .group_by(ApplicationStatus.name)
    )
    stage_rows = result.all()
    stage_breakdown = {row.name: row.count for row in stage_rows}

    # --- Interview Analytics Data ---
    # Conversion rates by round type (funnel data)
    result = await db.execute(
        select(
            RoundType.name.label("round_type"),
            func.count(Round.id).label("total"),
            func.sum(case((Round.outcome == "Passed", 1), else_=0)).label("passed"),
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(
            Application.user_id == user_id,
            or_(Round.completed_at >= start_date, Round.completed_at.is_(None)),
        )
        .group_by(RoundType.name)
        .order_by(RoundType.name)
    )
    funnel_rows = result.all()

    conversion_rates = {}
    for row in funnel_rows:
        conversion_rates[row.round_type] = {
            "total": row.total,
            "passed": row.passed or 0,
            "rate": round((row.passed / row.total * 100) if row.total > 0 else 0, 1),
        }

    # Outcomes by round type
    result = await db.execute(
        select(
            RoundType.name.label("round_type"),
            Round.outcome,
            func.count(Round.id).label("count"),
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(
            Application.user_id == user_id,
            or_(Round.completed_at >= start_date, Round.completed_at.is_(None)),
        )
        .group_by(RoundType.name, Round.outcome)
        .order_by(RoundType.name)
    )
    outcome_rows = result.all()

    outcomes = {}
    for row in outcome_rows:
        if row.round_type not in outcomes:
            outcomes[row.round_type] = {"passed": 0, "failed": 0, "pending": 0, "withdrew": 0}
        outcome_val = (row.outcome or "pending").lower()
        if outcome_val == "passed":
            outcomes[row.round_type]["passed"] = row.count
        elif outcome_val == "failed":
            outcomes[row.round_type]["failed"] = row.count
        elif outcome_val == "withdrew":
            outcomes[row.round_type]["withdrew"] = row.count
        else:
            outcomes[row.round_type]["pending"] = row.count

    # Average days between rounds (timeline data)
    result = await db.execute(
        select(
            RoundType.name.label("round_type"),
            Round.scheduled_at,
            Round.completed_at,
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(
            Application.user_id == user_id,
            Round.completed_at >= start_date,
            Round.completed_at.isnot(None),
            Round.scheduled_at.isnot(None),
        )
        .order_by(RoundType.name)
    )
    timeline_rows = result.all()

    avg_days_between_rounds = {}
    timeline_dict: dict[str, list[float]] = {}
    for row in timeline_rows:
        days_diff = (row.completed_at - row.scheduled_at).days
        if row.round_type not in timeline_dict:
            timeline_dict[row.round_type] = []
        timeline_dict[row.round_type].append(days_diff)

    for round_type, days_list in timeline_dict.items():
        avg_days_between_rounds[round_type] = round(sum(days_list) / len(days_list), 1) if days_list else 0.0

    # Speed indicators - average time from application to first interview
    # Use a subquery to get the minimum scheduled_at per application (avoids N+1 query)
    earliest_round_subq = (
        select(
            Round.application_id,
            func.min(Round.scheduled_at).label("first_scheduled")
        )
        .where(Round.scheduled_at.isnot(None))
        .group_by(Round.application_id)
        .subquery()
    )

    result = await db.execute(
        select(Application.id, Application.applied_at, earliest_round_subq.c.first_scheduled)
        .join(earliest_round_subq, Application.id == earliest_round_subq.c.application_id)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
    )
    app_first_interview = result.all()

    days_to_first_interview = []
    for app_row in app_first_interview:
        if app_row.first_scheduled:
            days = (app_row.first_scheduled.date() - app_row.applied_at).days
            if days >= 0:  # Only count positive values
                days_to_first_interview.append(days)

    avg_days_to_first = round(sum(days_to_first_interview) / len(days_to_first_interview), 1) if days_to_first_interview else 0

    speed_indicators = {
        "avg_days_to_first_interview": avg_days_to_first,
        "fastest_response_days": min(days_to_first_interview) if days_to_first_interview else 0,
        "slowest_response_days": max(days_to_first_interview) if days_to_first_interview else 0,
    }

    # --- Activity Tracking Data ---
    # Calculate weeks count based on period
    if period == "7d":
        weeks_count = 1
    elif period == "30d":
        weeks_count = 4
    elif period == "3m":
        weeks_count = 12
    elif period == "all":
        weeks_count = 52
    else:
        weeks_count = 4

    # Weekly applications
    result = await db.execute(
        select(Application.applied_at)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
        .order_by(Application.applied_at)
    )
    application_dates = result.scalars().all()

    weekly_data = defaultdict(lambda: {"applications": 0, "interviews": 0})
    for app_date in application_dates:
        days_diff = (today - app_date).days
        week_num = min(days_diff // 7, weeks_count - 1)
        weekly_data[week_num]["applications"] += 1

    # Weekly interviews
    result = await db.execute(
        select(Application.applied_at)
        .join(ApplicationStatus)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
            ApplicationStatus.name == "Interviewing",
        )
        .order_by(Application.applied_at)
    )
    interviewing_dates = result.scalars().all()

    for app_date in interviewing_dates:
        days_diff = (today - app_date).days
        week_num = min(days_diff // 7, weeks_count - 1)
        weekly_data[week_num]["interviews"] += 1

    weekly_applications = [
        {
            "week": f"Week {week_num + 1}",
            "applications": stats["applications"],
        }
        for week_num, stats in sorted(weekly_data.items())
    ]

    weekly_interviews = [
        {
            "week": f"Week {week_num + 1}",
            "interviews": stats["interviews"],
        }
        for week_num, stats in sorted(weekly_data.items())
    ]

    # Activity patterns - which days are most active
    result = await db.execute(
        select(func.strftime("%w", Application.applied_at).label("weekday"), func.count(Application.id).label("count"))
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
        .group_by(func.strftime("%w", Application.applied_at))
    )
    weekday_rows = result.all()

    weekday_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    weekday_counts = {}
    for row in weekday_rows:
        if row.weekday is not None:
            try:
                idx = int(row.weekday)
                if 0 <= idx < len(weekday_names):
                    weekday_counts[weekday_names[idx]] = row.count
            except (ValueError, TypeError):
                pass

    # Find most active day
    most_active_day = max(weekday_counts, key=weekday_counts.get) if weekday_counts else None

    patterns = {
        "most_active_day": most_active_day,
        "weekday_distribution": weekday_counts,
        "avg_applications_per_week": round(total_applications / weeks_count, 1) if weeks_count > 0 else 0,
    }

    # Active days (days with at least one application)
    result = await db.execute(
        select(Application.applied_at)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
        .distinct()
    )
    active_day_rows = result.scalars().all()
    active_days = [str(d) for d in active_day_rows]

    # Build and return the structured data
    return {
        "pipeline_overview": {
            "total_applications": total_applications,
            "interviews": interviews,
            "offers": offers,
            "response_rate": round(response_rate, 1),
            "interview_rate": round(interview_rate, 1),
            "active_applications": active_applications,
            "stage_breakdown": stage_breakdown,
        },
        "interview_analytics": {
            "conversion_rates": conversion_rates,
            "outcomes": outcomes,
            "avg_days_between_rounds": avg_days_between_rounds,
            "speed_indicators": speed_indicators,
        },
        "activity_tracking": {
            "weekly_applications": weekly_applications,
            "weekly_interviews": weekly_interviews,
            "patterns": patterns,
            "active_days": active_days,
        },
    }
