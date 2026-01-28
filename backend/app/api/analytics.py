from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, ApplicationStatus, ApplicationStatusHistory, User
from app.schemas.analytics import AnalyticsKPIsResponse, HeatmapData, HeatmapDay, SankeyData, SankeyLink, SankeyNode

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Sankey diagram source node color (matches frontend aqua-bright: #8ec07c)
SANKEY_SOURCE_COLOR = "#8ec07c"


@router.get("/sankey", response_model=SankeyData)
async def get_sankey_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Build Sankey diagram from actual application status transitions.
    Shows all unique trajectories/journeys applications have taken.
    """
    from sqlalchemy.orm import aliased

    # Get all history entries with status details for this user
    from_status = aliased(ApplicationStatus)
    to_status = aliased(ApplicationStatus)

    result = await db.execute(
        select(
            ApplicationStatusHistory.application_id,
            ApplicationStatusHistory.from_status_id,
            ApplicationStatusHistory.to_status_id,
            from_status.name.label('from_status_name'),
            from_status.color.label('from_status_color'),
            to_status.name.label('to_status_name'),
            to_status.color.label('to_status_color'),
        )
        .select_from(ApplicationStatusHistory)
        .join(Application, ApplicationStatusHistory.application_id == Application.id)
        .join(to_status, ApplicationStatusHistory.to_status_id == to_status.id)
        .outerjoin(from_status, ApplicationStatusHistory.from_status_id == from_status.id)
        .where(Application.user_id == user.id)
        .order_by(ApplicationStatusHistory.application_id, ApplicationStatusHistory.changed_at)
    )
    all_transitions = result.all()

    if not all_transitions:
        return SankeyData(nodes=[], links=[])

    # Build unique paths per application
    # Group transitions by application
    from collections import defaultdict

    app_transitions = defaultdict(list)
    for transition in all_transitions:
        app_transitions[transition.application_id].append({
            'from_status': transition.from_status_name,
            'to_status': transition.to_status_name,
            'to_color': transition.to_status_color,
        })

    # Collect all unique statuses that appear in journeys
    seen_statuses = set()
    for transitions in app_transitions.values():
        for t in transitions:
            if t['from_status']:
                seen_statuses.add(t['from_status'])
            seen_statuses.add(t['to_status'])

    # Build nodes: start with Applications source, then each unique status
    nodes = [SankeyNode(id="applications", name="Applications", color=SANKEY_SOURCE_COLOR)]
    status_name_to_node_id = {}
    status_name_to_color = {}

    for status_name in sorted(seen_statuses):
        # Find the color for this status
        for transitions in app_transitions.values():
            for t in transitions:
                if t['to_status'] == status_name:
                    status_name_to_color[status_name] = t['to_color']
                    break
            if status_name in status_name_to_color:
                break

        node_id = f"status_{status_name.lower().replace(' ', '_').replace('/', '_')}"
        status_name_to_node_id[status_name] = node_id
        nodes.append(SankeyNode(
            id=node_id,
            name=status_name,
            color=status_name_to_color.get(status_name, SANKEY_SOURCE_COLOR)
        ))

    # Count how many applications took each path segment
    link_counts = {}  # {(source_id, target_id): count}

    for app_id, transitions in app_transitions.items():
        for i, t in enumerate(transitions):
            # Determine source node
            if i == 0 or t['from_status'] is None:
                # First transition comes from "Applications" node
                source_id = "applications"
            else:
                source_id = status_name_to_node_id.get(t['from_status'])
                if not source_id:
                    # Status not in our tracked statuses, skip
                    continue

            target_id = status_name_to_node_id.get(t['to_status'])
            if not target_id:
                continue

            link_key = (source_id, target_id)
            link_counts[link_key] = link_counts.get(link_key, 0) + 1

    # Convert to Sankey links
    links = [
        SankeyLink(source=source, target=target, value=count)
        for (source, target), count in link_counts.items()
    ]

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
        # Note: applications is a list of date objects (from .scalars())
        days_diff = (today - app).days
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
        # Note: interviewing_apps is a list of date objects (from .scalars())
        days_diff = (today - app).days
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
