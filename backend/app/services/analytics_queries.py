"""Owner-scoped, applied-date cohorts and observed evidence (not reconstructed history)."""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Application, ApplicationStatusHistory, Round, User
from app.services import user_time
from app.services.requirement_insights import requirement_insights

ACTIVE_MEANINGS = {"applied", "screening", "interviewing", "offer"}
CLOSED_MEANINGS = {"accepted", "rejected", "withdrawn", "no_reply"}


def utc(value: datetime) -> datetime:
    # SQLite returns naive values for the UTC DateTime columns.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def analytics_clock(
    user: User, x_timezone: str | None, as_of: datetime | None = None
) -> tuple[datetime, str]:
    now = user_time._utc_now()
    if as_of is not None and (as_of.tzinfo is None or as_of > now):
        raise HTTPException(
            422, "as_of must be an offset-aware instant, not in the future"
        )
    return utc(as_of or now), user_time.get_effective_time_zone_name(
        user, x_timezone=x_timezone
    ) or "UTC"


def get_period_start_date(
    period: str, *, today: date, default_period: str = "30d"
) -> date | None:
    period = period if period in {"7d", "30d", "3m", "all"} else default_period
    days = {"7d": 7, "30d": 30, "3m": 90}.get(period)
    return today - timedelta(days=days - 1) if days else None


def _recorded_entry(entry: ApplicationStatusHistory) -> bool:
    return (
        not entry.is_gap
        and entry.time_provenance == "recorded"
        and entry.to_meaning_provenance == "recorded"
    )


def _known_entry(entry: ApplicationStatusHistory) -> bool:
    return (
        _recorded_entry(entry) and entry.to_meaning in ACTIVE_MEANINGS | CLOSED_MEANINGS
    )


def _continuous(
    left: ApplicationStatusHistory, right: ApplicationStatusHistory
) -> bool:
    return (
        _known_entry(left)
        and not right.is_gap
        and right.time_provenance == "recorded"
        and right.from_meaning_provenance == "recorded"
        and left.to_status_id == right.from_status_id
        and left.to_meaning == right.from_meaning
        and utc(left.changed_at) < utc(right.changed_at)
    )


async def get_calculation_data(
    db: AsyncSession,
    user_id: str,
    period: str,
    *,
    today: date | None = None,
    as_of: datetime | None = None,
    time_zone: str = "UTC",
) -> dict[str, Any]:
    """One ordered calculation shared by API and insight readers.

    Period selects applied dates only. History is never clipped to that period.
    Current records are labelled separately; they are not historical snapshots.
    """
    observed_at = user_time._utc_now()
    zone = ZoneInfo(time_zone)
    if as_of is None:
        as_of = observed_at
        if today is not None:
            as_of = min(as_of, datetime.combine(today, time.max, zone).astimezone(UTC))
    as_of = utc(as_of)
    today = as_of.astimezone(zone).date()
    period = period if period in {"7d", "30d", "3m", "all"} else "30d"
    start = get_period_start_date(period, today=today)
    filters = [
        Application.user_id == user_id,
        Application.applied_at <= today,
        Application.status_meaning != "preparing",
    ]
    if start is not None:
        filters.append(Application.applied_at >= start)
    apps = (
        await db.scalars(
            select(Application)
            .where(*filters)
            .options(
                selectinload(Application.status),
                selectinload(Application.status_history).selectinload(
                    ApplicationStatusHistory.to_status
                ),
                selectinload(Application.rounds).selectinload(Round.round_type),
            )
            .order_by(Application.applied_at, Application.id)
        )
    ).all()
    visits: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    activity: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    rounds: list[dict[str, Any]] = []
    stage_counts: Counter[str] = Counter()
    stage_labels: Counter[str] = Counter()
    totals: dict[tuple[str, str], float] = defaultdict(float)
    coverage = Counter(
        applications_with_history=0,
        applications_with_measured_residence=0,
        applications_with_missing_prefix=0,
        applications_with_gaps=0,
        applications_with_unknown_history=0,
        active_age_measured=0,
        active_age_unavailable=0,
        completed_visits_measured=0,
        visits_unavailable=0,
    )
    responded = undated = unknown_response = interviewed = offered = 0
    for app in apps:
        assert app.applied_at is not None  # The sent-date SQL cohort excludes NULL.
        current = (
            app.status_meaning
            if app.status_meaning_provenance == "recorded"
            else "unknown"
        )
        if app.archived_at is None:
            stage_counts[current] += 1
            stage_labels[app.status.name] += 1
        response_available = (
            app.response_state == "recorded"
            and app.response_recorded_at is not None
            and utc(app.response_recorded_at) <= as_of
            and (app.response_occurred_on is None or app.response_occurred_on <= today)
        )
        responded += response_available
        undated += response_available and app.response_occurred_on is None
        unknown_response += app.response_state == "legacy_unknown"
        history = sorted(
            (row for row in app.status_history if utc(row.changed_at) <= as_of),
            key=lambda row: (utc(row.changed_at), row.id),
        )
        future_history = sorted(
            (row for row in app.status_history if utc(row.changed_at) > as_of),
            key=lambda row: (utc(row.changed_at), row.id),
        )
        # Include future boundaries: they may be used to prove an as-of wait.
        times = Counter(utc(row.changed_at) for row in app.status_history)
        tied_ids = {row.id for row in history if times[utc(row.changed_at)] > 1}
        known = [row for row in history if _known_entry(row)]
        meanings = {row.to_meaning for row in known}
        interviewed += "interviewing" in meanings
        offered += "offer" in meanings
        missing_prefix = not history or not (
            _known_entry(history[0])
            and history[0].from_status_id is None
            and history[0].from_meaning_provenance == "recorded"
            and utc(history[0].changed_at).astimezone(zone).date() <= app.applied_at
        )
        gaps = [row.id for row in history if row.is_gap]
        unknown = [
            row.id for row in history if not row.is_gap and not _known_entry(row)
        ]
        coverage["applications_with_history"] += bool(history)
        coverage["applications_with_missing_prefix"] += missing_prefix
        coverage["applications_with_gaps"] += bool(gaps)
        coverage["applications_with_unknown_history"] += bool(unknown)
        app_visits = []
        for index, entry in enumerate(history):
            if not _recorded_entry(entry):
                continue
            # A recorded unknown classification is still a dated observation,
            # but cannot establish classified residence or milestones.
            nodes.append(
                {
                    "id": entry.id,
                    "name": entry.to_status.name,
                    "builtin_key": entry.to_status.builtin_key,
                    "meaning": entry.to_meaning,
                    "application_id": app.id,
                    "entered_at": utc(entry.changed_at),
                    "value": 1,
                }
            )
            activity.append(
                {
                    "application_id": app.id,
                    "event_id": entry.id,
                    "kind": "status_transition",
                    "meaning": entry.to_meaning,
                    "occurred_at": utc(entry.changed_at),
                }
            )
            if not _known_entry(entry):
                continue
            following = history[index + 1] if index + 1 < len(history) else None
            completed = (
                following is not None
                and _continuous(entry, following)
                and entry.id not in tied_ids
                and following.id not in tied_ids
            )
            latest = following is None
            matches_current = (
                app.status_id == entry.to_status_id and current == entry.to_meaning
            )
            # A later recorded transition must not erase the earlier as-of wait.
            current_known = (
                latest
                and (
                    _continuous(entry, future_history[0])
                    and times[utc(future_history[0].changed_at)] == 1
                    if future_history
                    else matches_current
                )
                and entry.id not in tied_ids
            )
            duration = None
            reason = "missing_or_conflicting_exit"
            kind = "unavailable"
            end = None
            if entry.to_meaning in CLOSED_MEANINGS:
                kind, reason = "closed", "closed_outcome_not_waiting"
            elif completed and following is not None:
                end = utc(following.changed_at)
                duration = (end - utc(entry.changed_at)).total_seconds() / 3600
                kind, reason = "completed", None
                coverage["completed_visits_measured"] += 1
            elif current_known:
                end = as_of
                duration = (as_of - utc(entry.changed_at)).total_seconds() / 3600
                kind, reason = "current", None
            if duration is None and kind != "closed":
                coverage["visits_unavailable"] += 1
            if duration is not None:
                totals[(app.id, entry.to_meaning)] += duration
            visit = {
                "application_id": app.id,
                "entry_id": entry.id,
                "exit_id": following.id
                if completed and following is not None
                else None,
                "meaning": entry.to_meaning,
                "entered_at": utc(entry.changed_at),
                "ended_at": end,
                "kind": kind,
                "hours": duration,
                "reason": reason,
            }
            app_visits.append(visit)
            if (
                index > 0
                and _continuous(history[index - 1], entry)
                and entry.id not in tied_ids
                and history[index - 1].id not in tied_ids
            ):
                links.append(
                    {"source": history[index - 1].id, "target": entry.id, "value": 1}
                )
        visits.extend(app_visits)
        measured = any(v["hours"] is not None for v in app_visits)
        coverage["applications_with_measured_residence"] += measured
        age_visit = next((v for v in app_visits if v["kind"] == "current"), None)
        historical_meaning = (
            known[-1].to_meaning
            if history and known and history[-1] == known[-1]
            else "unknown"
        )
        if history and history[-1].id in tied_ids:
            historical_meaning = "unknown"
        if not future_history and historical_meaning != current:
            historical_meaning = "unknown"
        if historical_meaning in ACTIVE_MEANINGS:
            coverage[
                "active_age_measured" if age_visit else "active_age_unavailable"
            ] += 1
        elif current in ACTIVE_MEANINGS and not future_history:
            coverage["active_age_unavailable"] += 1
        records.append(
            {
                "application_id": app.id,
                "company": app.company,
                "job_title": app.job_title,
                "source": app.source,
                "applied_at": app.applied_at,
                "evidence_revision": app.evidence_revision,
                "current_meaning": current,
                "as_of_meaning": historical_meaning,
                "response_recorded": bool(response_available),
                "response_state": app.response_state,
                "response_occurred_on": app.response_occurred_on
                if response_available
                else None,
                "response_recorded_at": utc(app.response_recorded_at)
                if response_available and app.response_recorded_at is not None
                else None,
                "current_stage_age_hours": age_visit["hours"] if age_visit else None,
                "missing_prefix": missing_prefix,
                "gap_ids": gaps,
                "unknown_history_ids": unknown,
                "ambiguous_time_ids": sorted(tied_ids),
            }
        )
        # Candidate chronology is scheduled UTC ascending, undated last;
        # IDs break ties independently of insertion order or database dialect.
        for rnd in sorted(
            app.rounds,
            key=lambda rnd: (
                rnd.scheduled_at is None,
                utc(rnd.scheduled_at)
                if rnd.scheduled_at
                else datetime.max.replace(tzinfo=UTC),
                rnd.id,
            ),
        ):
            scheduled = (
                utc(rnd.scheduled_at)
                if rnd.scheduled_at and utc(rnd.scheduled_at) <= as_of
                else None
            )
            completed_at = (
                utc(rnd.completed_at)
                if rnd.completed_at and utc(rnd.completed_at) <= as_of
                else None
            )
            for kind, instant in (
                ("round_scheduled", scheduled),
                ("round_completed", completed_at),
            ):
                if instant is not None:
                    activity.append(
                        {
                            "application_id": app.id,
                            "event_id": rnd.id,
                            "kind": kind,
                            "meaning": None,
                            "occurred_at": instant,
                        }
                    )
            if (
                scheduled is not None
                or completed_at is not None
                or (rnd.scheduled_at is None and rnd.completed_at is None)
            ):
                rounds.append(
                    {
                        "application_id": app.id,
                        "company": app.company,
                        "job_title": app.job_title,
                        "current_status": app.status.name,
                        "round_type": rnd.round_type.name,
                        "round_builtin_key": rnd.round_type.builtin_key,
                        "scheduled_at": scheduled,
                        "completed_at": completed_at,
                        "outcome": rnd.outcome if completed_at else None,
                    }
                )
    n = len(apps)
    response_days = [
        (app.response_occurred_on - app.applied_at).days
        for app in apps
        if app.applied_at is not None
        and app.response_state == "recorded"
        and app.response_recorded_at is not None
        and utc(app.response_recorded_at) <= as_of
        and app.response_occurred_on is not None
        and app.applied_at <= app.response_occurred_on <= today
    ]
    source_outcomes = {}
    rejected = set()
    positions = Counter()
    technologies = Counter()
    labels = {}
    for app in apps:
        source = (app.source or "").strip()
        bucket = source_outcomes.setdefault(
            source,
            {
                "source": source or None,
                "sent": 0,
                "interview": 0,
                "offer": 0,
                "rejected": 0,
                "withdrawn": 0,
            },
        )
        bucket["sent"] += 1
        reached = {
            entry.to_meaning
            for entry in app.status_history
            if _recorded_entry(entry) and utc(entry.changed_at) <= as_of
        }
        for meaning, key in (
            ("interviewing", "interview"),
            ("offer", "offer"),
            ("rejected", "rejected"),
            ("withdrawn", "withdrawn"),
        ):
            bucket[key] += meaning in reached
        if "rejected" in reached:
            rejected.add(app.id)
        title = app.job_title.strip()
        if title:
            positions[title.casefold()] += 1
            key = ("position", title.casefold())
            labels[key] = min(title, labels.get(key, title))
        unique = set()
        for technology in app.skills or []:
            if isinstance(technology, str) and technology.strip():
                label = technology.strip()
                unique.add(label.casefold())
                key = ("technology", label.casefold())
                labels[key] = min(label, labels.get(key, label))
        technologies.update(unique)

    def frequencies(counter, kind):
        return [
            {"label": labels[(kind, key)], "count": count}
            for key, count in sorted(
                counter.items(), key=lambda pair: (-pair[1], pair[0])
            )
        ]

    stage_hours = defaultdict(list)
    for visit in visits:
        if visit["kind"] == "completed" and visit["hours"] is not None:
            stage_hours[visit["meaning"]].append(visit["hours"])
    stage_averages = [
        {
            "meaning": meaning,
            "mean_days": sum(hours) / len(hours) / 24,
            "mean_hours": sum(hours) / len(hours),
            "n": len(hours),
        }
        for meaning, hours in sorted(stage_hours.items())
    ]
    from sqlalchemy import func

    current_phases = [
        {"meaning": meaning, "count": count}
        for meaning, count in (
            await db.execute(
                select(Application.status_meaning, func.count())
                .where(
                    Application.user_id == user_id, Application.archived_at.is_(None)
                )
                .group_by(Application.status_meaning)
            )
        ).all()
    ]

    from app.services.job_analyses import current_matches

    def rate(value: int) -> float | None:
        return round(value / n * 100, 1) if n else None

    return {
        "scope": {
            "period": period,
            "cohort_start": start,
            "cohort_end": today,
            "as_of": as_of,
            "time_zone": time_zone,
            "denominator": n,
            "basis": "applied_date_cohort",
        },
        "current_record_basis": {
            "observed_at": observed_at,
            "basis": "live_current_records_not_historical_as_of",
        },
        **requirement_insights(apps, await current_matches(db, user_id, apps)),
        "first_response": {
            "mean_days": sum(response_days) / len(response_days)
            if response_days
            else None,
            "n": len(response_days),
            "unknown_count": n - len(response_days),
        },
        "rejected_count": len(rejected),
        "outcomes_by_source": list(source_outcomes.values()),
        "top_positions": frequencies(positions, "position"),
        "top_technologies": frequencies(technologies, "technology"),
        "stage_averages": stage_averages,
        "current_phases": current_phases,
        "total_applications": n,
        "responded": responded,
        "response_rate": rate(responded),
        "response_unknown": unknown_response,
        "response_undated": undated,
        "response_not_recorded_as_of": n - responded - unknown_response,
        "interviews": interviewed,
        "offers": offered,
        "interview_rate": rate(interviewed),
        "offer_rate": rate(offered),
        "active_applications": sum(stage_counts[m] for m in ACTIVE_MEANINGS),
        "closed_applications": sum(stage_counts[m] for m in CLOSED_MEANINGS),
        "unknown_applications": stage_counts["unknown"],
        "current_stage_breakdown": dict(stage_counts),
        "stage_breakdown": dict(stage_labels),
        "applications": records,
        "visits": visits,
        "coverage": dict(coverage),
        "stage_totals": [
            {"application_id": app_id, "meaning": meaning, "hours": hours}
            for (app_id, meaning), hours in sorted(totals.items())
        ],
        "activity": sorted(
            activity,
            key=lambda event: (event["occurred_at"], event["event_id"], event["kind"]),
        ),
        "nodes": nodes,
        "links": links,
        "rounds": rounds,
    }


async def get_pipeline_overview_data(
    db: AsyncSession,
    user_id: str,
    period: str,
    *,
    today: date | None = None,
    as_of: datetime | None = None,
    time_zone: str = "UTC",
) -> dict[str, Any]:
    return await get_calculation_data(
        db, user_id, period, today=today, as_of=as_of, time_zone=time_zone
    )


async def get_interview_rounds_data(
    db: AsyncSession,
    user_id: str,
    period: str,
    round_type: str | None = None,
    *,
    today: date | None = None,
    as_of: datetime | None = None,
    time_zone: str = "UTC",
    calculation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = (
        calculation
        if calculation is not None
        else await get_calculation_data(
            db, user_id, period, today=today, as_of=as_of, time_zone=time_zone
        )
    )
    rounds = [
        row
        for row in data["rounds"]
        if round_type is None or row["round_type"] == round_type
    ]
    builtin_keys = {}
    for row in rounds:
        builtin_keys.setdefault(row["round_type"], set()).add(
            row.get("round_builtin_key")
        )
    identities = {
        name: next(iter(keys)) if len(keys) == 1 else None
        for name, keys in builtin_keys.items()
    }
    outcomes: dict[str, Counter] = defaultdict(
        lambda: Counter(passed=0, failed=0, pending=0, withdrew=0)
    )
    durations: dict[str, list[float]] = defaultdict(list)
    candidates: dict[str, dict[str, Any]] = {}
    for row in rounds:
        name = row["round_type"]
        outcome = (row["outcome"] or "pending").lower()
        outcomes[name][outcome if outcome in outcomes[name] else "pending"] += 1
        days = None
        if row["scheduled_at"] and row["completed_at"]:
            days = (row["completed_at"] - row["scheduled_at"]).total_seconds() / 86400
            if days >= 0:
                durations[name].append(days)
            else:
                days = None
        candidate = candidates.setdefault(
            row["application_id"],
            {
                "application_id": row["application_id"],
                "candidate_name": row["company"],
                "role": row["job_title"],
                "current_status": row["current_status"],
                "rounds_completed": [],
            },
        )
        candidate["rounds_completed"].append(
            {
                "round_type": name,
                "outcome": row["outcome"],
                "scheduled_at": row["scheduled_at"],
                "completed_at": row["completed_at"],
                "days_in_round": days,
            }
        )
    funnel = [
        {
            "round": name,
            "builtin_key": identities.get(name),
            "count": sum(counts.values()),
            "passed": counts["passed"],
            "conversion_rate": round(counts["passed"] / sum(counts.values()) * 100, 1),
        }
        for name, counts in sorted(outcomes.items())
    ]
    timeline = [
        {
            "round": name,
            "builtin_key": identities.get(name),
            "avg_days": round(sum(values) / len(values), 1),
            "avg_hours": sum(values) / len(values) * 24,
        }
        for name, values in sorted(durations.items())
    ]
    return {
        "scope": data["scope"],
        "funnel_data": funnel,
        "outcome_data": [
            {"round": name, "builtin_key": identities.get(name), **counts}
            for name, counts in sorted(outcomes.items())
        ],
        "timeline_data": timeline,
        "candidate_progress": list(candidates.values()),
        "conversion_rates": {
            row["round"]: {
                "total": row["count"],
                "passed": row["passed"],
                "rate": row["conversion_rate"],
            }
            for row in funnel
        },
        "outcomes": dict(outcomes),
        "avg_scheduled_to_completed_days": {
            row["round"]: row["avg_days"] for row in timeline
        },
        "duration_basis": "elapsed_scheduled_to_completed_not_stage_residence_or_response_speed",
    }


async def get_activity_tracking_data(
    db: AsyncSession,
    user_id: str,
    period: str,
    *,
    today: date | None = None,
    as_of: datetime | None = None,
    time_zone: str = "UTC",
    calculation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = (
        calculation
        if calculation is not None
        else await get_calculation_data(
            db, user_id, period, today=today, as_of=as_of, time_zone=time_zone
        )
    )
    scope = data["scope"]
    end_day: date = scope["cohort_end"]
    start: date | None = scope["cohort_start"]
    zone = ZoneInfo(scope["time_zone"])
    weekly: dict[int, Counter] = defaultdict(
        lambda: Counter(
            applications=0, interviews=0, rounds_scheduled=0, rounds_completed=0
        )
    )
    weekdays: Counter[str] = Counter()
    active_days = set()
    for app in data["applications"]:
        applied = app["applied_at"]
        weekly[(end_day - applied).days // 7]["applications"] += 1
        weekdays[applied.strftime("%A")] += 1
        active_days.add(str(applied))
    dated_activity = []
    for event in data["activity"]:
        day = event["occurred_at"].astimezone(zone).date()
        if start is not None and day < start:
            continue
        dated_activity.append(event)
        key = {
            "round_scheduled": "rounds_scheduled",
            "round_completed": "rounds_completed",
        }.get(event["kind"])
        if event["kind"] == "status_transition" and event["meaning"] == "interviewing":
            key = "interviews"
        if key:
            weekly[(end_day - day).days // 7][key] += 1
    weeks = max(
        1,
        (
            (
                end_day
                - (
                    start
                    or min(
                        (a["applied_at"] for a in data["applications"]), default=end_day
                    )
                )
            ).days
            + 7
        )
        // 7,
    )
    points = [
        {"week": f"Week {week + 1}", **counts}
        for week, counts in sorted(weekly.items())
    ]
    return {
        "scope": scope,
        "activity_basis": "cohort_events_on_their_own_dates_within_period",
        "events": dated_activity,
        "weekly_data": points,
        "weekly_applications": [
            {"week": p["week"], "applications": p["applications"]} for p in points
        ],
        "weekly_interviews": [
            {"week": p["week"], "interviews": p["interviews"]} for p in points
        ],
        "patterns": {
            "most_active_day": max(weekdays, key=lambda d: weekdays[d])
            if weekdays
            else None,
            "weekday_distribution": dict(weekdays),
            "avg_applications_per_week": round(len(data["applications"]) / weeks, 1),
        },
        "active_days": sorted(active_days),
    }
