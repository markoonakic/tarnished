"""Interview calendar, board, task lists and dashboard projections."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.workspace import DB, Owner, Page, PerPage
from app.core.deps import get_request_time_zone
from app.models import Application, JobLead, Round
from app.models.workspace import Reminder
from app.schemas.application import ApplicationListItem
from app.schemas.round import RoundResponse
from app.schemas.workspace import ReminderKind
from app.services.job_filters import JobFilters, apply_filters, filter_params
from app.services.reference_data import list_visible_statuses
from app.services.user_time import get_effective_time_zone_name
from app.services.workspace import owned, paged, record_dict, reminder_badge, utc

router = APIRouter(prefix="/api", tags=["planning"])


async def round_view(db, row, user_id):
    application = await owned(db, Application, row.application_id, user_id)
    return {
        **RoundResponse.model_validate(row).model_dump(),
        "company": application.company,
        "company_id": application.company_id,
        "job_title": application.job_title,
    }


@router.get("/rounds/{record_id}")
async def interview(record_id: str, db: DB, user: Owner):
    return await round_view(db, await owned(db, Round, record_id, user.id), user.id)


@router.get("/rounds")
async def interviews(
    db: DB,
    user: Owner,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    state: Literal["upcoming", "completed", "all"] = "all",
    page: Page = 1,
    per_page: PerPage = 25,
):
    query = (
        select(Round)
        .join(Application)
        .where(Application.user_id == user.id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
    )
    if from_:
        query = query.where(Round.scheduled_at >= utc(from_))
    if to:
        query = query.where(Round.scheduled_at <= utc(to))
    if state == "upcoming":
        query = query.where(
            Round.scheduled_at >= datetime.now(UTC),
            Round.completed_at.is_(None),
            or_(Round.outcome.is_(None), Round.outcome.in_(["pending", "scheduled"])),
        )
    elif state == "completed":
        query = query.where(Round.completed_at.is_not(None))
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = await db.scalars(
        query.order_by(Round.scheduled_at, Round.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return {
        "items": [await round_view(db, row, user.id) for row in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


async def deadlines(db, user, zone_name, until=None):
    zone = ZoneInfo(zone_name)
    result = []
    for model, target in ((JobLead, "lead"), (Application, "application")):
        reminder_exists = (
            select(Reminder.id)
            .where(
                Reminder.user_id == user.id,
                getattr(Reminder, target + "_id") == model.id,
                Reminder.kind == "application_deadline",
                Reminder.state == "open",
            )
            .exists()
        )
        query = select(model).where(
            model.user_id == user.id, model.deadline.is_not(None), ~reminder_exists
        )
        query = (
            query.where(
                or_(model.decision.is_(None), model.decision == "interesting"),
                model.converted_to_application_id.is_(None),
            )
            if model is JobLead
            else query.where(Application.archived_at.is_(None))
        )
        if until:
            query = query.where(model.deadline <= until.astimezone(zone).date())
        for row in await db.scalars(
            query.order_by(model.deadline, model.id).limit(100)
        ):
            result.append(
                {
                    "id": row.id,
                    "target_type": target,
                    "title": f"{row.company or ''} — {row.title if model is JobLead else row.job_title}",
                    "due_at": datetime.combine(row.deadline, time(9), zone).astimezone(
                        UTC
                    ),
                }
            )
    for field, kind in (
        ("task_deadline", "task_submission"),
        ("expected_reply_on", "expected_feedback"),
    ):
        exists = (
            select(Reminder.id)
            .where(
                Reminder.user_id == user.id,
                Reminder.round_id == Round.id,
                Reminder.kind == kind,
                Reminder.state == "open",
            )
            .exists()
        )
        query = (
            select(Round, Application)
            .join(Application)
            .where(
                Application.user_id == user.id,
                Application.archived_at.is_(None),
                getattr(Round, field).is_not(None),
                ~exists,
            )
            .order_by(getattr(Round, field), Round.id)
            .limit(100)
        )
        for row, app in (await db.execute(query)).all():
            value = getattr(row, field)
            instant = (
                utc(value)
                if isinstance(value, datetime)
                else datetime.combine(value, time(9), zone).astimezone(UTC)
            )
            if until is None or instant <= until:
                result.append(
                    {
                        "id": row.id,
                        "target_type": "round",
                        "title": f"{app.company} — {app.job_title}",
                        "due_at": instant,
                        "kind": kind,
                    }
                )
    return sorted(result, key=lambda row: row["due_at"])[:100]


@router.get("/tasks")
async def tasks(
    db: DB,
    user: Owner,
    state: Literal["open", "done", "all"] = "open",
    kind: ReminderKind | None = None,
    page: Page = 1,
    per_page: PerPage = 25,
    zone: str | None = Depends(get_request_time_zone),
):
    query = select(Reminder).where(Reminder.user_id == user.id)
    if state != "all":
        query = query.where(Reminder.state == state)
    if kind:
        query = query.where(Reminder.kind == kind)
    result = await paged(
        db, query.order_by(Reminder.due_at, Reminder.id), page, per_page
    )
    result["deadlines"] = (
        await deadlines(
            db, user, get_effective_time_zone_name(user, x_timezone=zone) or "UTC"
        )
        if state != "done" and not kind
        else []
    )
    result["badge"] = await reminder_badge(db, user, zone)
    return result


@router.get("/dashboard/overview")
async def overview(
    db: DB, user: Owner, zone: str | None = Depends(get_request_time_zone)
):
    statuses = await list_visible_statuses(db, user.id)
    counts = dict(
        (
            await db.execute(
                select(Application.status_id, func.count())
                .where(
                    Application.user_id == user.id, Application.archived_at.is_(None)
                )
                .group_by(Application.status_id)
            )
        ).all()
    )
    until = datetime.now(UTC) + timedelta(days=7)
    return {
        "pipeline": [
            {
                "status_id": status.id,
                "name": status.name,
                "color": status.color,
                "builtin_key": status.builtin_key,
                "count": counts.get(status.id, 0),
            }
            for status in statuses
        ],
        "upcoming_interviews": (
            await interviews(db, user, None, None, "upcoming", 1, 5)
        )["items"],
        "tasks": [
            record_dict(row)
            for row in await db.scalars(
                select(Reminder)
                .where(
                    Reminder.user_id == user.id,
                    Reminder.state == "open",
                    Reminder.due_at <= until,
                )
                .order_by(Reminder.due_at)
                .limit(100)
            )
        ],
        "deadlines": await deadlines(
            db,
            user,
            get_effective_time_zone_name(user, x_timezone=zone) or "UTC",
            until,
        ),
        "recent_applications": [
            ApplicationListItem.model_validate(row).model_dump()
            for row in await db.scalars(
                select(Application)
                .where(
                    Application.user_id == user.id, Application.archived_at.is_(None)
                )
                .options(selectinload(Application.status))
                .order_by(Application.updated_at.desc(), Application.id)
                .limit(5)
            )
        ],
        "badge": await reminder_badge(db, user, zone),
    }


@router.get("/applications/board")
async def board(
    db: DB,
    user: Owner,
    filters: JobFilters = Depends(filter_params),
    status_id: str | None = None,
    search: str | None = None,
    source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: Page = 1,
    per_page: PerPage = 25,
):
    query = apply_filters(
        select(Application).where(Application.user_id == user.id),
        Application,
        filters,
        date_from,
        date_to,
    )
    if search:
        query = query.where(
            or_(
                Application.company.ilike(f"%{search}%"),
                Application.job_title.ilike(f"%{search}%"),
                Application.job_description.ilike(f"%{search}%"),
            )
        )
    if source:
        query = query.where(Application.source == source)
    if status_id:
        query = query.where(Application.status_id == status_id)
    statuses = await list_visible_statuses(db, user.id)
    columns = []
    for status in statuses:
        column = query.where(Application.status_id == status.id)
        count = (
            await db.scalar(select(func.count()).select_from(column.subquery())) or 0
        )
        rows = await db.scalars(
            column.options(selectinload(Application.status))
            .order_by(Application.updated_at.desc(), Application.id)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        items = []
        for row in rows:
            next_interview = await db.scalar(
                select(func.min(Round.scheduled_at)).where(
                    Round.application_id == row.id,
                    Round.scheduled_at >= datetime.now(UTC),
                    Round.completed_at.is_(None),
                )
            )
            items.append(
                {
                    **ApplicationListItem.model_validate(row).model_dump(),
                    "round_count": await db.scalar(
                        select(func.count())
                        .select_from(Round)
                        .where(Round.application_id == row.id)
                    )
                    or 0,
                    "next_interview_at": utc(next_interview)
                    if next_interview is not None
                    else None,
                    "open_reminder_count": await db.scalar(
                        select(func.count())
                        .select_from(Reminder)
                        .where(
                            Reminder.user_id == user.id,
                            Reminder.application_id == row.id,
                            Reminder.state == "open",
                        )
                    )
                    or 0,
                }
            )
        columns.append(
            {
                "status_id": status.id,
                "count": count,
                "items": items,
                "page": page,
                "per_page": per_page,
            }
        )
    return {"columns": columns}
