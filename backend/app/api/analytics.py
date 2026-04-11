from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_api_key_scope
from app.models import Application, ApplicationStatus, ApplicationStatusHistory, User
from app.schemas.analytics import (
    AnalyticsKPIsResponse,
    HeatmapData,
    HeatmapDay,
    InterviewRoundsResponse,
    SankeyData,
    SankeyLink,
    SankeyNode,
)
from app.services.analytics_queries import (
    get_activity_tracking_data,
    get_interview_rounds_data,
    get_pipeline_overview_data,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Node colors are now handled by the frontend using theme-aware colors


@router.get("/sankey", response_model=SankeyData)
async def get_sankey_data(
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
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
            from_status.name.label("from_status_name"),
            from_status.color.label("from_status_color"),
            to_status.name.label("to_status_name"),
            to_status.color.label("to_status_color"),
        )
        .select_from(ApplicationStatusHistory)
        .join(Application, ApplicationStatusHistory.application_id == Application.id)
        .join(to_status, ApplicationStatusHistory.to_status_id == to_status.id)
        .outerjoin(
            from_status, ApplicationStatusHistory.from_status_id == from_status.id
        )
        .where(Application.user_id == user.id)
        .order_by(
            ApplicationStatusHistory.application_id, ApplicationStatusHistory.changed_at
        )
    )
    all_transitions = result.all()

    if not all_transitions:
        return SankeyData(nodes=[], links=[])

    # Build unique paths per application
    # Group transitions by application
    from collections import defaultdict

    app_transitions = defaultdict(list)
    for transition in all_transitions:
        app_transitions[transition.application_id].append(
            {
                "from_status": transition.from_status_name,
                "to_status": transition.to_status_name,
                "to_color": transition.to_status_color,
            }
        )

    # Terminal statuses that get stage-specific nodes
    TERMINAL_STATUSES = {"Rejected", "Withdrawn"}

    # Collect all unique statuses and track transitions to terminal statuses
    seen_statuses = set()
    terminal_transitions = defaultdict(
        set
    )  # {terminal_status: {from_status1, from_status2, ...}}

    for transitions in app_transitions.values():
        for t in transitions:
            if t["from_status"]:
                seen_statuses.add(t["from_status"])
            seen_statuses.add(t["to_status"])

            # Track which stages lead to terminal statuses
            if t["to_status"] in TERMINAL_STATUSES and t["from_status"]:
                terminal_transitions[t["to_status"]].add(t["from_status"])

    # Build nodes (no "applications" source node - we use explicit values instead)
    # Note: Frontend handles actual colors using theme-aware mapping
    nodes = []
    status_name_to_node_id = {}
    status_name_to_color = {}

    # Count initial-status applications (from=None) for explicit node values
    initial_status_counts = defaultdict(int)
    for transitions in app_transitions.values():
        for t in transitions:
            if t["from_status"] is None:
                initial_status_counts[t["to_status"]] += 1

    for status_name in sorted(seen_statuses):
        # Find the color for this status
        for transitions in app_transitions.values():
            for t in transitions:
                if t["to_status"] == status_name:
                    status_name_to_color[status_name] = t["to_color"]
                    break
            if status_name in status_name_to_color:
                break

        # For terminal statuses, create stage-specific nodes
        if status_name in terminal_transitions:
            # Create one node per source stage that leads to this terminal status
            for from_stage in sorted(terminal_transitions[status_name]):
                node_id = f"terminal_{status_name.lower()}_{from_stage.lower().replace(' ', '_').replace('/', '_')}"
                status_name_to_node_id[(from_stage, status_name)] = node_id
                nodes.append(
                    SankeyNode(
                        id=node_id,
                        name=status_name,  # Label is just "Rejected" or "Withdrawn"
                        color=status_name_to_color.get(
                            status_name, "#8ec07c"
                        ),  # Fallback, frontend uses theme
                    )
                )
        else:
            # Non-terminal statuses get single node with explicit value for initial apps
            node_id = (
                f"status_{status_name.lower().replace(' ', '_').replace('/', '_')}"
            )
            status_name_to_node_id[status_name] = node_id
            nodes.append(
                SankeyNode(
                    id=node_id,
                    name=status_name,
                    color=status_name_to_color.get(
                        status_name, "#8ec07c"
                    ),  # Fallback, frontend uses theme
                    value=initial_status_counts.get(
                        status_name
                    ),  # Initial apps at this status
                )
            )

    # Count how many applications took each path segment
    # Prevent cycles by tracking visited statuses per application
    link_counts = {}  # {(source_id, target_id): count}

    for _app_id, transitions in app_transitions.items():
        visited_statuses = set()  # Track statuses visited in this application's journey

        for t in transitions:
            # Skip initial status entries (from_status=None) - counted via node value instead
            if t["from_status"] is None:
                visited_statuses.add(t["to_status"])
                continue

            # Determine source node
            source_id = status_name_to_node_id.get(t["from_status"])
            if not source_id:
                # Status not in our tracked statuses, skip
                continue

            # Determine target node - use stage-specific for terminal statuses
            if t["to_status"] in TERMINAL_STATUSES:
                # Use (from_stage, to_status) tuple key for terminal statuses
                target_id = status_name_to_node_id.get(
                    (t["from_status"], t["to_status"])
                )
            else:
                target_id = status_name_to_node_id.get(t["to_status"])

            if not target_id:
                continue

            # Prevent cycles: don't link back to already visited statuses
            if t["to_status"] in visited_statuses:
                continue

            # Mark this status as visited
            visited_statuses.add(t["to_status"])

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
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()

    if rolling or (year is None):
        # Default: rolling 12 months
        end_date = today
        start_date = today - timedelta(days=365)
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
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    """
    Get analytics KPIs filtered by time period.
    Period options: 7d, 30d, 3m, all
    """
    pipeline_data = await get_pipeline_overview_data(db, str(user.id), period)

    return AnalyticsKPIsResponse(
        total_applications=pipeline_data["total_applications"],
        interviews=pipeline_data["interviews"],
        offers=pipeline_data["offers"],
        application_to_interview_rate=pipeline_data["interview_rate"],
        response_rate=pipeline_data["response_rate"],
        active_opportunities=pipeline_data["active_applications"],
    )


@router.get("/weekly")
async def get_weekly_data(
    period: str = "30d",
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    """
    Get weekly application trends data.
    Groups applications by week for the specified period.
    """
    activity_tracking = await get_activity_tracking_data(db, str(user.id), period)
    return activity_tracking["weekly_data"]


@router.get("/interview-rounds", response_model=InterviewRoundsResponse)
async def get_interview_rounds_analytics(
    period: str = "all",
    round_type: str | None = None,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("analytics:read")),
    db: AsyncSession = Depends(get_db),
):
    """
    Get interview rounds analytics data.

    Returns funnel data (conversion rates), outcome data (Passed/Failed/Pending/Withdrew per round),
    timeline data (average days in stage), and candidate progression data.

    Period options: 7d, 30d, 3m, all
    round_type: optional filter by round type name
    """
    analytics = await get_interview_rounds_data(
        db,
        str(user.id),
        period,
        round_type,
    )

    return InterviewRoundsResponse(**analytics)
