from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_request_time_zone, require_api_key_scope
from app.models import Application, User
from app.schemas.analytics import (
    AnalyticsKPIsResponse,
    HeatmapData,
    HeatmapDay,
    InterviewRoundsResponse,
    PipelineMetrics,
    SankeyData,
)
from app.services.analytics_queries import (
    analytics_clock,
    get_activity_tracking_data,
    get_interview_rounds_data,
    get_pipeline_overview_data,
)
from app.services.user_time import get_user_local_today

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/sankey", response_model=SankeyData)
async def get_sankey_data(
    period: str = "all",
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    instant, zone = analytics_clock(user, x_timezone, as_of)
    data = await get_pipeline_overview_data(
        db, user.id, period, as_of=instant, time_zone=zone
    )
    return SankeyData(**data)


@router.get("/pipeline", response_model=PipelineMetrics)
async def get_pipeline_metrics(
    period: str = "30d",
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    instant, zone = analytics_clock(user, x_timezone, as_of)
    return await get_pipeline_overview_data(
        db, user.id, period, as_of=instant, time_zone=zone
    )


@router.get("/activity")
async def get_activity_data(
    period: str = "30d",
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    instant, zone = analytics_clock(user, x_timezone, as_of)
    return await get_activity_tracking_data(
        db, user.id, period, as_of=instant, time_zone=zone
    )


@router.get("/heatmap", response_model=HeatmapData)
async def get_heatmap_data(
    year: int | None = Query(None, ge=1, le=9999),
    rolling: bool = False,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    today = get_user_local_today(user, x_timezone=x_timezone)

    if rolling or (year is None):
        # Default: rolling 12 months
        end_date = today
        start_date = today - timedelta(days=365)
    else:
        # Specific year: full calendar year
        start_date = date(year, 1, 1)
        end_date = min(date(year, 12, 31), today)

    result = await db.execute(
        select(Application.applied_at, func.count(Application.id))
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
            Application.applied_at <= end_date,
        )
        .group_by(Application.applied_at)
        .order_by(Application.applied_at)
    )
    daily_counts = result.all()

    days = [
        HeatmapDay(date=str(applied_at), count=count)
        for applied_at, count in daily_counts
    ]

    max_count = max((d.count for d in days), default=0)

    return HeatmapData(days=days, max_count=max_count)


@router.get("/kpis", response_model=AnalyticsKPIsResponse)
async def get_analytics_kpis(
    period: str = "30d",
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    """
    Get analytics KPIs filtered by time period.
    Period options: 7d, 30d, 3m, all
    """
    instant, zone = analytics_clock(user, x_timezone, as_of)
    pipeline_data = await get_pipeline_overview_data(
        db,
        str(user.id),
        period,
        as_of=instant,
        time_zone=zone,
    )

    return AnalyticsKPIsResponse(
        **pipeline_data,
        application_to_interview_rate=pipeline_data["interview_rate"],
        active_opportunities=pipeline_data["active_applications"],
    )


@router.get("/weekly")
async def get_weekly_data(
    period: str = "30d",
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    """
    Get weekly application trends data.
    Groups applications by week for the specified period.
    """
    instant, zone = analytics_clock(user, x_timezone, as_of)
    activity_tracking = await get_activity_tracking_data(
        db,
        str(user.id),
        period,
        as_of=instant,
        time_zone=zone,
    )
    return activity_tracking["weekly_data"]


@router.get("/interview-rounds", response_model=InterviewRoundsResponse)
async def get_interview_rounds_analytics(
    period: str = "all",
    round_type: str | None = None,
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    """
    Get interview rounds analytics data.

    Returns funnel data (conversion rates), outcome data (Passed/Failed/Pending/Withdrew per round),
    timeline data (elapsed scheduled-to-completed days, not stage residence), and candidate progression data.

    Period options: 7d, 30d, 3m, all
    round_type: optional filter by round type name
    """
    instant, zone = analytics_clock(user, x_timezone, as_of)
    analytics = await get_interview_rounds_data(
        db,
        str(user.id),
        period,
        round_type,
        as_of=instant,
        time_zone=zone,
    )

    return InterviewRoundsResponse(**analytics)
