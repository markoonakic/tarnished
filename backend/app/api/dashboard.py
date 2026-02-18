from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, ApplicationStatus, User
from app.schemas import (
    DashboardKPIsResponse,
    NeedsAttentionItem,
    NeedsAttentionResponse,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/kpis", response_model=DashboardKPIsResponse)
async def get_dashboard_kpis(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()

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

    # Calculate 7-day trend
    if previous_7_days_count > 0:
        last_7_days_trend = round(
            ((last_7_days_count - previous_7_days_count) / previous_7_days_count) * 100,
            1,
        )
    else:
        last_7_days_trend = 100.0 if last_7_days_count > 0 else 0.0

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

    # Calculate 30-day trend
    if previous_30_days_count > 0:
        last_30_days_trend = round(
            ((last_30_days_count - previous_30_days_count) / previous_30_days_count)
            * 100,
            1,
        )
    else:
        last_30_days_trend = 100.0 if last_30_days_count > 0 else 0.0

    # Count active opportunities (not Rejected or Withdrawn)
    result_active = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            ApplicationStatus.name.not_in(["Rejected", "Withdrawn"]),
        )
    )
    active_opportunities = result_active.scalar() or 0

    return DashboardKPIsResponse(
        last_7_days=last_7_days_count,
        last_7_days_trend=last_7_days_trend,
        last_30_days=last_30_days_count,
        last_30_days_trend=last_30_days_trend,
        active_opportunities=active_opportunities,
    )


@router.get("/needs-attention", response_model=NeedsAttentionResponse)
async def get_needs_attention(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()

    # Calculate date thresholds
    follow_up_start = today - timedelta(days=10)
    follow_up_end = today - timedelta(days=7)
    no_response_threshold = today - timedelta(days=7)

    # Follow-ups: Applications 7-10 days ago in "Applied" status
    result_follow_ups = await db.execute(
        select(Application, ApplicationStatus)
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            ApplicationStatus.name == "Applied",
            Application.applied_at >= follow_up_start,
            Application.applied_at <= follow_up_end,
        )
        .order_by(Application.applied_at.desc())
        .limit(5)
    )
    follow_ups_rows = result_follow_ups.all()
    follow_ups = [
        NeedsAttentionItem(
            id=str(app.id),
            company=app.company,
            job_title=app.job_title,
            days_since=(today - app.applied_at).days,
        )
        for app, _ in follow_ups_rows
    ]

    # No responses: Applications 7+ days ago in "Applied" or "Screening"
    result_no_responses = await db.execute(
        select(Application, ApplicationStatus)
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            ApplicationStatus.name.in_(["Applied", "Screening"]),
            Application.applied_at < no_response_threshold,
        )
        .order_by(Application.applied_at.asc())
        .limit(5)
    )
    no_responses_rows = result_no_responses.all()
    no_responses = [
        NeedsAttentionItem(
            id=str(app.id),
            company=app.company,
            job_title=app.job_title,
            days_since=(today - app.applied_at).days,
        )
        for app, _ in no_responses_rows
    ]

    # Interviewing: Applications in "Interviewing" status
    result_interviewing = await db.execute(
        select(Application, ApplicationStatus)
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            ApplicationStatus.name == "Interviewing",
        )
        .order_by(Application.applied_at.desc())
        .limit(5)
    )
    interviewing_rows = result_interviewing.all()
    interviewing = [
        NeedsAttentionItem(
            id=str(app.id),
            company=app.company,
            job_title=app.job_title,
            days_since=(today - app.applied_at).days,
        )
        for app, _ in interviewing_rows
    ]

    return NeedsAttentionResponse(
        follow_ups=follow_ups,
        no_responses=no_responses,
        interviewing=interviewing,
    )
