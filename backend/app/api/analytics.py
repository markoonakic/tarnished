from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, ApplicationStatus, User
from app.schemas.analytics import AnalyticsKPIsResponse, HeatmapData, HeatmapDay, SankeyData, SankeyLink, SankeyNode

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/sankey", response_model=SankeyData)
async def get_sankey_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Build a sequential funnel Sankey diagram showing application progression.
    Only includes forward-path statuses (Applied → Screening → Interviewing → Offer → Accepted).
    """
    # Get all statuses ordered by their order field
    result = await db.execute(
        select(ApplicationStatus)
        .order_by(ApplicationStatus.order)
    )
    all_statuses = result.scalars().all()

    # Forward path statuses (orders 1-5)
    forward_orders = [1, 2, 3, 4, 5]  # Applied, Screening, Interviewing, Offer, Accepted
    forward_statuses = {s.order: s for s in all_statuses if s.order in forward_orders}

    # Count applications at each stage
    # An application is "at" a stage if its current status has that order OR higher
    stage_counts = {}
    for order in forward_orders:
        # Count applications with status order >= current stage
        # This represents how many applications reached this stage or beyond
        result = await db.execute(
            select(func.count(Application.id))
            .join(ApplicationStatus)
            .where(
                Application.user_id == user.id,
                ApplicationStatus.order >= order
            )
        )
        stage_counts[order] = result.scalar() or 0

    # Calculate flow between stages
    # The flow from stage A to stage B is the count at stage B
    # (since to reach B, you must have passed through A)

    # Build nodes: start with Applications source, then each stage
    nodes = [SankeyNode(id="applications", name="Applications", color="#8ec07c")]

    for order in forward_orders:
        status = forward_statuses[order]
        nodes.append(SankeyNode(id=str(status.id), name=status.name, color=status.color))

    # Build sequential links
    links = []
    for i, order in enumerate(forward_orders):
        if i == 0:
            # Applications to Applied
            source_id = "applications"
        else:
            # Previous stage to current stage
            prev_status = forward_statuses[forward_orders[i - 1]]
            source_id = str(prev_status.id)

        target_status = forward_statuses[order]
        target_id = str(target_status.id)

        # Flow value = count at this stage
        flow_value = stage_counts[order]

        if flow_value > 0:
            links.append(SankeyLink(
                source=source_id,
                target=target_id,
                value=flow_value,
            ))

    return SankeyData(nodes=nodes, links=links)


@router.get("/heatmap", response_model=HeatmapData)
async def get_heatmap_data(
    year: int | None = None,
    rolling: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()

    if rolling or (year is None):
        # Default: rolling 12 months
        end_date = today
        start_date = date(today.year - 1, today.month, today.day)
    else:
        # Specific year: full calendar year
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

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
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get analytics KPIs filtered by time period.
    Period options: 7d, 30d, 3m, all
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
        start_date = date(2000, 1, 1)  # Far past date for "all time"
    else:
        start_date = today - timedelta(days=30)  # Default to 30d

    # Total applications in period
    result = await db.execute(
        select(func.count(Application.id))
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
        )
    )
    total_applications = result.scalar() or 0

    # Interviews (status_id = Interviewing)
    result = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
            ApplicationStatus.name == "Interviewing",
        )
    )
    interviews = result.scalar() or 0

    # Offers (status_id = Offer)
    result = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
            ApplicationStatus.name == "Offer",
        )
    )
    offers = result.scalar() or 0

    # Application to interview rate
    application_to_interview_rate = (
        (interviews / total_applications * 100) if total_applications > 0 else 0
    )

    # Response rate: applications that got any response (not "No Reply" status)
    # This is applications NOT in "No Reply" status
    result = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
            ApplicationStatus.name != "No Reply",
        )
    )
    responded = result.scalar() or 0
    response_rate = (responded / total_applications * 100) if total_applications > 0 else 0

    # Active opportunities: not Rejected or Withdrawn
    result = await db.execute(
        select(func.count(Application.id))
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
            ApplicationStatus.name.not_in(["Rejected", "Withdrawn"]),
        )
    )
    active_opportunities = result.scalar() or 0

    return AnalyticsKPIsResponse(
        total_applications=total_applications,
        interviews=interviews,
        offers=offers,
        application_to_interview_rate=round(application_to_interview_rate, 1),
        response_rate=round(response_rate, 1),
        active_opportunities=active_opportunities,
    )


@router.get("/weekly")
async def get_weekly_data(
    period: str = "30d",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get weekly application trends data.
    Groups applications by week for the specified period.
    """
    today = date.today()

    # Calculate date range and number of weeks
    if period == "7d":
        weeks_count = 1
        start_date = today - timedelta(days=7)
    elif period == "30d":
        weeks_count = 4
        start_date = today - timedelta(days=30)
    elif period == "3m":
        weeks_count = 12
        start_date = today - timedelta(days=90)
    elif period == "all":
        weeks_count = 52
        start_date = date(2000, 1, 1)
    else:
        weeks_count = 4
        start_date = today - timedelta(days=30)

    # Get applications in the date range
    result = await db.execute(
        select(Application.applied_at)
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
        )
        .order_by(Application.applied_at)
    )
    applications = result.scalars().all()

    # Group by week
    from collections import defaultdict

    weekly_data = defaultdict(lambda: {"applications": 0, "interviews": 0})

    for app in applications:
        # Calculate week number (weeks since start_date)
        days_diff = (today - app.applied_at).days
        week_num = min(days_diff // 7, weeks_count - 1)
        week_label = f"Week {week_num + 1}"

        weekly_data[week_label]["applications"] += 1

        # Check if this application reached interviewing stage
        # We need to query the current status
        # For simplicity, we'll count based on current status name
        # A more accurate approach would use history, but that's more complex

    # Now get interview counts by week
    # Applications that are currently in "Interviewing" status
    result = await db.execute(
        select(Application.applied_at)
        .join(ApplicationStatus)
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
            ApplicationStatus.name == "Interviewing",
        )
        .order_by(Application.applied_at)
    )
    interviewing_apps = result.scalars().all()

    for app in interviewing_apps:
        days_diff = (today - app.applied_at).days
        week_num = min(days_diff // 7, weeks_count - 1)
        week_label = f"Week {week_num + 1}"
        weekly_data[week_label]["interviews"] += 1

    # Convert to list format
    data = [
        {
            "week": week,
            "applications": stats["applications"],
            "interviews": stats["interviews"],
        }
        for week, stats in sorted(weekly_data.items())
    ]

    return data
