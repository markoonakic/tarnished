from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, or_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, ApplicationStatus, ApplicationStatusHistory, Round, RoundType, User
from app.schemas.analytics import (
    AnalyticsKPIsResponse,
    CandidateProgress,
    FunnelData,
    HeatmapData,
    HeatmapDay,
    InterviewRoundsResponse,
    OutcomeData,
    RoundProgress,
    SankeyData,
    SankeyLink,
    SankeyNode,
    TimelineData,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Node colors are now handled by the frontend using theme-aware colors
FAR_PAST_DATE = date(2000, 1, 1)


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

    # Terminal statuses that get stage-specific nodes
    TERMINAL_STATUSES = {"Rejected", "Withdrawn"}

    # Collect all unique statuses and track transitions to terminal statuses
    seen_statuses = set()
    terminal_transitions = defaultdict(set)  # {terminal_status: {from_status1, from_status2, ...}}

    for transitions in app_transitions.values():
        for t in transitions:
            if t['from_status']:
                seen_statuses.add(t['from_status'])
            seen_statuses.add(t['to_status'])

            # Track which stages lead to terminal statuses
            if t['to_status'] in TERMINAL_STATUSES and t['from_status']:
                terminal_transitions[t['to_status']].add(t['from_status'])

    # Build nodes: start with Applications source, then each unique status
    # Note: Frontend handles actual colors using theme-aware mapping
    nodes = [SankeyNode(id="applications", name="Applications", color="#8ec07c")]  # Placeholder, frontend uses theme
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

        # For terminal statuses, create stage-specific nodes
        if status_name in terminal_transitions:
            # Create one node per source stage that leads to this terminal status
            for from_stage in sorted(terminal_transitions[status_name]):
                node_id = f"terminal_{status_name.lower()}_{from_stage.lower().replace(' ', '_').replace('/', '_')}"
                status_name_to_node_id[(from_stage, status_name)] = node_id
                nodes.append(SankeyNode(
                    id=node_id,
                    name=status_name,  # Label is just "Rejected" or "Withdrawn"
                    color=status_name_to_color.get(status_name, "#8ec07c")  # Fallback, frontend uses theme
                ))
        else:
            # Non-terminal statuses get single node
            node_id = f"status_{status_name.lower().replace(' ', '_').replace('/', '_')}"
            status_name_to_node_id[status_name] = node_id
            nodes.append(SankeyNode(
                id=node_id,
                name=status_name,
                color=status_name_to_color.get(status_name, "#8ec07c")  # Fallback, frontend uses theme
            ))

    # Count how many applications took each path segment
    # Prevent cycles by tracking visited statuses per application
    link_counts = {}  # {(source_id, target_id): count}

    for app_id, transitions in app_transitions.items():
        visited_statuses = set()  # Track statuses visited in this application's journey

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

            # Determine target node - use stage-specific for terminal statuses
            if t['to_status'] in TERMINAL_STATUSES and t['from_status']:
                # Use (from_stage, to_status) tuple key for terminal statuses
                target_id = status_name_to_node_id.get((t['from_status'], t['to_status']))
            else:
                target_id = status_name_to_node_id.get(t['to_status'])

            if not target_id:
                continue

            # Prevent cycles: don't link back to already visited statuses
            if t['to_status'] in visited_statuses:
                continue

            # Mark this status as visited
            visited_statuses.add(t['to_status'])

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
        start_date = FAR_PAST_DATE
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
        start_date = FAR_PAST_DATE
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

        weekly_data[week_num]["applications"] += 1

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
        weekly_data[week_num]["interviews"] += 1

    # Convert to list format with numeric sorting
    data = [
        {
            "week": f"Week {week_num + 1}",
            "applications": stats["applications"],
            "interviews": stats["interviews"],
        }
        for week_num, stats in sorted(weekly_data.items())
    ]

    return data


@router.get("/interview-rounds", response_model=InterviewRoundsResponse)
async def get_interview_rounds_analytics(
    period: str = "all",
    round_type: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get interview rounds analytics data.

    Returns funnel data (conversion rates), outcome data (Passed/Failed/Pending/Withdrew per round),
    timeline data (average days in stage), and candidate progression data.

    Period options: 7d, 30d, 3m, all
    round_type: optional filter by round type name
    """
    today = date.today()

    # Calculate date range based on period (applies to round completion date)
    if period == "7d":
        start_date = today - timedelta(days=7)
    elif period == "30d":
        start_date = today - timedelta(days=30)
    elif period == "3m":
        start_date = today - timedelta(days=90)
    elif period == "all":
        start_date = FAR_PAST_DATE
    else:
        start_date = FAR_PAST_DATE  # Default to all

    # Build base conditions for all queries
    base_conditions = [
        Application.user_id == user.id,
        or_(Round.completed_at >= start_date, Round.completed_at.is_(None)),
    ]

    # Add round_type filter if specified
    if round_type:
        base_conditions.append(RoundType.name == round_type)

    # Funnel Data Query: Aggregate rounds by round type
    funnel_result = await db.execute(
        select(
            RoundType.name.label('round_type'),
            func.count(Round.id).label('total'),
            func.sum(case((Round.outcome == "Passed", 1), else_=0)).label('passed'),
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(*base_conditions)
        .group_by(RoundType.name)
        .order_by(RoundType.name)
    )
    funnel_rows = funnel_result.all()

    funnel_data = [
        FunnelData(
            round=row.round_type,
            count=row.total,
            passed=row.passed or 0,
            conversion_rate=round((row.passed / row.total * 100) if row.total > 0 else 0, 1),
        )
        for row in funnel_rows
    ]

    # Outcome Data Query: Count outcomes by round type
    outcome_result = await db.execute(
        select(
            RoundType.name.label('round_type'),
            Round.outcome,
            func.count(Round.id).label('count'),
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(*base_conditions)
        .group_by(RoundType.name, Round.outcome)
        .order_by(RoundType.name)
    )
    outcome_rows = outcome_result.all()

    # Pivot outcome data to one row per round type
    outcome_dict: dict[str, dict[str, int]] = {}
    for row in outcome_rows:
        round_name = row.round_type
        outcome_val = row.outcome if row.outcome else "pending"

        if round_name not in outcome_dict:
            outcome_dict[round_name] = {"passed": 0, "failed": 0, "pending": 0, "withdrew": 0}

        # Map outcome values to categories
        if outcome_val.lower() == "passed":
            outcome_dict[round_name]["passed"] = row.count
        elif outcome_val.lower() == "failed":
            outcome_dict[round_name]["failed"] = row.count
        elif outcome_val.lower() == "withdrew":
            outcome_dict[round_name]["withdrew"] = row.count
        else:  # pending or any other outcome
            outcome_dict[round_name]["pending"] = row.count

    outcome_data = [
        OutcomeData(
            round=round_name,
            passed=counts["passed"],
            failed=counts["failed"],
            pending=counts["pending"],
            withdrew=counts["withdrew"],
        )
        for round_name, counts in sorted(outcome_dict.items())
    ]

    # Timeline Data Query: Average days in round by type (only completed rounds)
    # Get all completed rounds with both scheduled_at and completed_at
    timeline_result = await db.execute(
        select(
            RoundType.name.label('round_type'),
            Round.scheduled_at,
            Round.completed_at,
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(
            *base_conditions,
            Round.completed_at >= start_date,
            Round.completed_at.isnot(None),
            Round.scheduled_at.isnot(None),
        )
        .order_by(RoundType.name)
    )
    timeline_rows = timeline_result.all()

    # Calculate average days per round type in Python
    timeline_dict: dict[str, list[float]] = {}
    for row in timeline_rows:
        days_diff = (row.completed_at - row.scheduled_at).days
        if row.round_type not in timeline_dict:
            timeline_dict[row.round_type] = []
        timeline_dict[row.round_type].append(days_diff)

    timeline_data = [
        TimelineData(
            round=round_type,
            avg_days=round(sum(days_list) / len(days_list), 1) if days_list else 0.0,
        )
        for round_type, days_list in sorted(timeline_dict.items())
    ]

    # Candidate Progress Query: Get applications with their rounds
    # First get applications with at least one round
    apps_with_rounds_result = await db.execute(
        select(Application.id, ApplicationStatus.name.label('status_name'))
        .select_from(Application)
        .join(ApplicationStatus, Application.status_id == ApplicationStatus.id)
        .join(Round, Round.application_id == Application.id)
        .where(Application.user_id == user.id)
        .distinct()
        .order_by(Application.id)
    )
    apps_with_rounds = apps_with_rounds_result.all()

    candidate_progress = []

    for app_row in apps_with_rounds:
        app_id = app_row.id
        status_name = app_row.status_name

        # Get all rounds for this application
        rounds_result = await db.execute(
            select(
                RoundType.name.label('round_type'),
                Round.outcome,
                Round.completed_at,
                Round.scheduled_at,
            )
            .select_from(Round)
            .join(RoundType, Round.round_type_id == RoundType.id)
            .where(Round.application_id == app_id)
            .order_by(Round.scheduled_at)
        )
        rounds = rounds_result.all()

        rounds_completed = []
        for r in rounds:
            # Calculate days in round
            days_in_round = None
            if r.completed_at and r.scheduled_at:
                days_in_round = (r.completed_at.date() - r.scheduled_at.date()).days

            rounds_completed.append(
                RoundProgress(
                    round_type=r.round_type,
                    outcome=r.outcome,
                    completed_at=r.completed_at,
                    days_in_round=days_in_round,
                )
            )

        # Get application details for candidate name and role
        app_detail_result = await db.execute(
            select(Application.company, Application.job_title).where(Application.id == app_id)
        )
        app_detail = app_detail_result.first()

        candidate_progress.append(
            CandidateProgress(
                application_id=app_id,
                candidate_name=app_detail.company if app_detail else "",
                role=app_detail.job_title if app_detail else "",
                rounds_completed=rounds_completed,
                current_status=status_name,
            )
        )

    return InterviewRoundsResponse(
        funnel_data=funnel_data,
        outcome_data=outcome_data,
        timeline_data=timeline_data,
        candidate_progress=candidate_progress,
    )
