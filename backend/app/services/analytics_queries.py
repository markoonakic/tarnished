from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import case, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, ApplicationStatus, Round, RoundType

FAR_PAST_DATE = date(2000, 1, 1)


def get_period_start_date(period: str, *, default_period: str = "30d") -> date:
    today = date.today()
    normalized_period = period or default_period

    if normalized_period == "7d":
        return today - timedelta(days=7)
    if normalized_period == "30d":
        return today - timedelta(days=30)
    if normalized_period == "3m":
        return today - timedelta(days=90)
    if normalized_period == "all":
        return FAR_PAST_DATE

    return get_period_start_date(default_period, default_period=default_period)


def get_weeks_count(period: str, *, default_period: str = "30d") -> int:
    normalized_period = period or default_period

    if normalized_period == "7d":
        return 1
    if normalized_period == "30d":
        return 4
    if normalized_period == "3m":
        return 12
    if normalized_period == "all":
        return 52

    return get_weeks_count(default_period, default_period=default_period)


def build_round_filters(
    user_id: str,
    start_date: date,
    round_type: str | None = None,
) -> list[Any]:
    filters = [
        Application.user_id == user_id,
        or_(Round.completed_at >= start_date, Round.completed_at.is_(None)),
    ]
    if round_type:
        filters.append(RoundType.name == round_type)
    return filters


async def get_pipeline_overview_data(
    db: AsyncSession,
    user_id: str,
    period: str,
) -> dict[str, Any]:
    start_date = get_period_start_date(period, default_period="30d")

    result = await db.execute(
        select(func.count(Application.id)).where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
    )
    total_applications = result.scalar() or 0

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
    response_rate = (
        (responded / total_applications * 100) if total_applications > 0 else 0
    )
    interview_rate = (
        (interviews / total_applications * 100) if total_applications > 0 else 0
    )

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

    result = await db.execute(
        select(ApplicationStatus.name, func.count(Application.id).label("count"))
        .join(Application, Application.status_id == ApplicationStatus.id)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
        .group_by(ApplicationStatus.name)
    )
    stage_breakdown = {row.name: row.count for row in result.all()}

    return {
        "total_applications": total_applications,
        "interviews": interviews,
        "offers": offers,
        "response_rate": round(response_rate, 1),
        "interview_rate": round(interview_rate, 1),
        "active_applications": active_applications,
        "stage_breakdown": stage_breakdown,
    }


async def get_interview_rounds_data(
    db: AsyncSession,
    user_id: str,
    period: str,
    round_type: str | None = None,
) -> dict[str, Any]:
    start_date = get_period_start_date(period, default_period="all")
    base_filters = build_round_filters(user_id, start_date, round_type)

    funnel_result = await db.execute(
        select(
            RoundType.name.label("round_type"),
            func.count(Round.id).label("total"),
            func.sum(case((Round.outcome == "Passed", 1), else_=0)).label("passed"),
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(*base_filters)
        .group_by(RoundType.name)
        .order_by(RoundType.name)
    )
    funnel_rows = funnel_result.all()
    funnel_data = [
        {
            "round": row.round_type,
            "count": row.total,
            "passed": row.passed or 0,
            "conversion_rate": round(
                (row.passed / row.total * 100) if row.total > 0 else 0, 1
            ),
        }
        for row in funnel_rows
    ]
    conversion_rates = {
        item["round"]: {
            "total": item["count"],
            "passed": item["passed"],
            "rate": item["conversion_rate"],
        }
        for item in funnel_data
    }

    outcome_result = await db.execute(
        select(
            RoundType.name.label("round_type"),
            Round.outcome,
            func.count(Round.id).label("count"),
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(*base_filters)
        .group_by(RoundType.name, Round.outcome)
        .order_by(RoundType.name)
    )
    outcome_map: dict[str, dict[str, int]] = {}
    for row in outcome_result.all():
        round_name = row.round_type
        outcome_value = (row.outcome or "pending").lower()
        count = int(row._mapping["count"] or 0)
        if round_name not in outcome_map:
            outcome_map[round_name] = {
                "passed": 0,
                "failed": 0,
                "pending": 0,
                "withdrew": 0,
            }
        if outcome_value == "passed":
            outcome_map[round_name]["passed"] = count
        elif outcome_value == "failed":
            outcome_map[round_name]["failed"] = count
        elif outcome_value == "withdrew":
            outcome_map[round_name]["withdrew"] = count
        else:
            outcome_map[round_name]["pending"] = count

    outcome_data = [
        {
            "round": round_name,
            "passed": counts["passed"],
            "failed": counts["failed"],
            "pending": counts["pending"],
            "withdrew": counts["withdrew"],
        }
        for round_name, counts in sorted(outcome_map.items())
    ]

    timeline_result = await db.execute(
        select(
            RoundType.name.label("round_type"),
            Round.scheduled_at,
            Round.completed_at,
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(
            *base_filters,
            Round.completed_at >= start_date,
            Round.completed_at.isnot(None),
            Round.scheduled_at.isnot(None),
        )
        .order_by(RoundType.name)
    )
    timeline_map: dict[str, list[float]] = defaultdict(list)
    for row in timeline_result.all():
        timeline_map[row.round_type].append((row.completed_at - row.scheduled_at).days)

    timeline_data = [
        {
            "round": round_name,
            "avg_days": round(sum(days) / len(days), 1) if days else 0.0,
        }
        for round_name, days in sorted(timeline_map.items())
    ]
    avg_days_between_rounds = {
        item["round"]: item["avg_days"] for item in timeline_data
    }

    earliest_round_subq = (
        select(
            Round.application_id,
            func.min(Round.scheduled_at).label("first_scheduled"),
        )
        .select_from(Round)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .join(Application, Round.application_id == Application.id)
        .where(
            *base_filters,
            Round.scheduled_at.isnot(None),
        )
        .group_by(Round.application_id)
        .subquery()
    )

    first_interview_result = await db.execute(
        select(
            Application.id,
            Application.applied_at,
            earliest_round_subq.c.first_scheduled,
        )
        .join(
            earliest_round_subq,
            Application.id == earliest_round_subq.c.application_id,
        )
        .where(
            Application.user_id == user_id,
            Application.applied_at
            >= get_period_start_date(period, default_period="30d"),
        )
    )
    days_to_first_interview = []
    for row in first_interview_result.all():
        if row.first_scheduled:
            days = (row.first_scheduled.date() - row.applied_at).days
            if days >= 0:
                days_to_first_interview.append(days)

    speed_indicators = {
        "avg_days_to_first_interview": round(
            sum(days_to_first_interview) / len(days_to_first_interview), 1
        )
        if days_to_first_interview
        else 0,
        "fastest_response_days": min(days_to_first_interview)
        if days_to_first_interview
        else 0,
        "slowest_response_days": max(days_to_first_interview)
        if days_to_first_interview
        else 0,
    }

    candidate_progress_result = await db.execute(
        select(
            Application.id.label("application_id"),
            Application.company,
            Application.job_title,
            ApplicationStatus.name.label("status_name"),
            RoundType.name.label("round_type"),
            Round.outcome,
            Round.completed_at,
            Round.scheduled_at,
        )
        .select_from(Round)
        .join(Application, Round.application_id == Application.id)
        .join(ApplicationStatus, Application.status_id == ApplicationStatus.id)
        .join(RoundType, Round.round_type_id == RoundType.id)
        .where(*base_filters)
        .order_by(Application.id, Round.scheduled_at)
    )
    candidate_progress_map: dict[str, dict[str, Any]] = {}
    for row in candidate_progress_result.all():
        candidate = candidate_progress_map.setdefault(
            row.application_id,
            {
                "application_id": row.application_id,
                "candidate_name": row.company,
                "role": row.job_title,
                "current_status": row.status_name,
                "rounds_completed": [],
            },
        )
        days_in_round = None
        if row.completed_at and row.scheduled_at:
            days_in_round = (row.completed_at.date() - row.scheduled_at.date()).days
        candidate["rounds_completed"].append(
            {
                "round_type": row.round_type,
                "outcome": row.outcome,
                "completed_at": row.completed_at,
                "days_in_round": days_in_round,
            }
        )

    candidate_progress = list(candidate_progress_map.values())

    return {
        "funnel_data": funnel_data,
        "outcome_data": outcome_data,
        "timeline_data": timeline_data,
        "candidate_progress": candidate_progress,
        "conversion_rates": conversion_rates,
        "outcomes": outcome_map,
        "avg_days_between_rounds": avg_days_between_rounds,
        "speed_indicators": speed_indicators,
    }


async def get_activity_tracking_data(
    db: AsyncSession,
    user_id: str,
    period: str,
) -> dict[str, Any]:
    start_date = get_period_start_date(period, default_period="30d")
    weeks_count = get_weeks_count(period, default_period="30d")
    today = date.today()

    result = await db.execute(
        select(Application.applied_at)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
        .order_by(Application.applied_at)
    )
    application_dates = result.scalars().all()

    weekly_data: dict[int, dict[str, int]] = defaultdict(
        lambda: {"applications": 0, "interviews": 0}
    )
    for applied_at in application_dates:
        week_num = min((today - applied_at).days // 7, weeks_count - 1)
        weekly_data[week_num]["applications"] += 1

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
    for applied_at in interviewing_dates:
        week_num = min((today - applied_at).days // 7, weeks_count - 1)
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

    result = await db.execute(
        select(
            extract("dow", Application.applied_at).label("weekday"),
            func.count(Application.id).label("count"),
        )
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
        .group_by(extract("dow", Application.applied_at))
    )
    weekday_names = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ]
    weekday_counts: dict[str, int] = {}
    for row in result.all():
        if row.weekday is None:
            continue
        try:
            idx = int(row.weekday)
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(weekday_names):
            weekday_counts[weekday_names[idx]] = int(row._mapping["count"] or 0)

    result = await db.execute(
        select(Application.applied_at)
        .where(
            Application.user_id == user_id,
            Application.applied_at >= start_date,
        )
        .distinct()
    )
    active_days = [str(applied_at) for applied_at in result.scalars().all()]

    total_applications = len(application_dates)
    patterns = {
        "most_active_day": max(weekday_counts, key=lambda day: weekday_counts[day])
        if weekday_counts
        else None,
        "weekday_distribution": weekday_counts,
        "avg_applications_per_week": round(total_applications / weeks_count, 1)
        if weeks_count > 0
        else 0,
    }

    weekly_data_points = [
        {
            "week": f"Week {week_num + 1}",
            "applications": stats["applications"],
            "interviews": stats["interviews"],
        }
        for week_num, stats in sorted(weekly_data.items())
    ]

    return {
        "weekly_data": weekly_data_points,
        "weekly_applications": weekly_applications,
        "weekly_interviews": weekly_interviews,
        "patterns": patterns,
        "active_days": active_days,
    }
