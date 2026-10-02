from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_request_time_zone, require_api_key_scope
from app.models import Application, User
from app.schemas import (
    DashboardKPIsResponse,
    NeedsAttentionItem,
    NeedsAttentionResponse,
)
from app.services.analytics_queries import analytics_clock, get_pipeline_overview_data

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _calculate_period_trend(current: int, previous: int) -> float | None:
    if previous == 0:
        return 0.0 if current == 0 else None

    return round(((current - previous) / previous) * 100, 1)


@router.get("/kpis", response_model=DashboardKPIsResponse)
async def get_dashboard_kpis(
    period: str = "all",
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("dashboard:read")),
    db: AsyncSession = Depends(get_db),
):
    instant, zone = analytics_clock(user, x_timezone, as_of)
    pipeline = await get_pipeline_overview_data(
        db, user.id, period, as_of=instant, time_zone=zone
    )
    today = pipeline["scope"]["cohort_end"]

    # Calculate date ranges
    last_7_days_start = today - timedelta(days=6)
    previous_7_days_start = last_7_days_start - timedelta(days=7)
    previous_7_days_end = last_7_days_start - timedelta(days=1)

    last_30_days_start = today - timedelta(days=29)
    previous_30_days_start = last_30_days_start - timedelta(days=30)
    previous_30_days_end = last_30_days_start - timedelta(days=1)

    # Count applications in last 7 days
    result_last_7 = await db.execute(
        select(func.count(Application.id)).where(
            Application.user_id == user.id,
            Application.applied_at >= last_7_days_start,
            Application.applied_at <= today,
        )
    )
    last_7_days_count = result_last_7.scalar() or 0

    # Count applications in previous 7 days (for trend)
    result_prev_7 = await db.execute(
        select(func.count(Application.id)).where(
            Application.user_id == user.id,
            Application.applied_at >= previous_7_days_start,
            Application.applied_at <= previous_7_days_end,
        )
    )
    previous_7_days_count = result_prev_7.scalar() or 0

    last_7_days_trend = _calculate_period_trend(
        last_7_days_count,
        previous_7_days_count,
    )

    # Count applications in last 30 days
    result_last_30 = await db.execute(
        select(func.count(Application.id)).where(
            Application.user_id == user.id,
            Application.applied_at >= last_30_days_start,
            Application.applied_at <= today,
        )
    )
    last_30_days_count = result_last_30.scalar() or 0

    # Count applications in previous 30 days (for trend)
    result_prev_30 = await db.execute(
        select(func.count(Application.id)).where(
            Application.user_id == user.id,
            Application.applied_at >= previous_30_days_start,
            Application.applied_at <= previous_30_days_end,
        )
    )
    previous_30_days_count = result_prev_30.scalar() or 0

    last_30_days_trend = _calculate_period_trend(
        last_30_days_count,
        previous_30_days_count,
    )

    return DashboardKPIsResponse(
        last_7_days=last_7_days_count,
        last_7_days_trend=last_7_days_trend,
        last_30_days=last_30_days_count,
        last_30_days_trend=last_30_days_trend,
        active_opportunities=pipeline["active_applications"],
        scope=pipeline["scope"],
        current_record_basis=pipeline["current_record_basis"],
        unknown_opportunities=pipeline["unknown_applications"],
    )


@router.get("/needs-attention", response_model=NeedsAttentionResponse)
async def get_needs_attention(
    period: str = "all",
    as_of: datetime | None = None,
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("dashboard:read")),
    db: AsyncSession = Depends(get_db),
):
    instant, zone = analytics_clock(user, x_timezone, as_of)
    pipeline = await get_pipeline_overview_data(
        db, user.id, period, as_of=instant, time_zone=zone
    )
    today = pipeline["scope"]["cohort_end"]

    def item(record, reason):
        return NeedsAttentionItem(
            id=record["application_id"],
            company=record["company"],
            job_title=record["job_title"],
            days_since=(today - record["applied_at"]).days,
            reason=reason,
            current_stage_age_hours=record["current_stage_age_hours"],
        )

    records = pipeline["applications"]
    unanswered = [
        row
        for row in records
        if not row["response_recorded"]
        and row["current_meaning"] in {"applied", "screening"}
    ]
    follow_ups = [
        item(row, "Applied 7–10 calendar days ago; no recorded substantive response")
        for row in reversed(unanswered)
        if row["current_meaning"] == "applied"
        and 7 <= (today - row["applied_at"]).days <= 10
    ][:5]
    no_responses = [
        item(
            row,
            "Applied more than 7 calendar days ago; no recorded substantive response (not proof of silence)",
        )
        for row in unanswered
        if (today - row["applied_at"]).days > 7
    ][:5]
    interviewing = [
        item(row, "Currently classified interviewing; no speed target implied")
        for row in reversed(records)
        if row["current_meaning"] == "interviewing"
    ][:5]
    return NeedsAttentionResponse(
        follow_ups=follow_ups,
        no_responses=no_responses,
        interviewing=interviewing,
        scope=pipeline["scope"],
        current_record_basis=pipeline["current_record_basis"],
    )
