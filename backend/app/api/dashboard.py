from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, ApplicationStatus, User
from app.schemas import DashboardKPIsResponse

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
        select(func.count(Application.id))
        .where(
            Application.user_id == user.id,
            Application.applied_at >= last_7_days_start,
            Application.applied_at <= today,
        )
    )
    last_7_days_count = result_last_7.scalar() or 0

    # Count applications in previous 7 days (for trend)
    result_prev_7 = await db.execute(
        select(func.count(Application.id))
        .where(
            Application.user_id == user.id,
            Application.applied_at >= previous_7_days_start,
            Application.applied_at <= previous_7_days_end,
        )
    )
    previous_7_days_count = result_prev_7.scalar() or 0

    # Calculate 7-day trend
    if previous_7_days_count > 0:
        last_7_days_trend = round(
            ((last_7_days_count - previous_7_days_count) / previous_7_days_count) * 100, 1
        )
    else:
        last_7_days_trend = 100.0 if last_7_days_count > 0 else 0.0

    # Count applications in last 30 days
    result_last_30 = await db.execute(
        select(func.count(Application.id))
        .where(
            Application.user_id == user.id,
            Application.applied_at >= last_30_days_start,
            Application.applied_at <= today,
        )
    )
    last_30_days_count = result_last_30.scalar() or 0

    # Count applications in previous 30 days (for trend)
    result_prev_30 = await db.execute(
        select(func.count(Application.id))
        .where(
            Application.user_id == user.id,
            Application.applied_at >= previous_30_days_start,
            Application.applied_at <= previous_30_days_end,
        )
    )
    previous_30_days_count = result_prev_30.scalar() or 0

    # Calculate 30-day trend
    if previous_30_days_count > 0:
        last_30_days_trend = round(
            ((last_30_days_count - previous_30_days_count) / previous_30_days_count) * 100, 1
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
