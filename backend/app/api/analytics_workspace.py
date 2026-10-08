"""Deterministic breakdowns and bounded, private-text-free activity history."""

import json
from datetime import datetime, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import String, cast, func, literal, select, union_all
from sqlalchemy.orm import selectinload

from app.api.workspace import DB, Owner, Page, PerPage
from app.core.deps import get_request_time_zone
from app.models import Application, ApplicationStatusHistory, AuditLog, JobLead, Round
from app.models.workspace import Company, Contact
from app.services.analytics_queries import (
    analytics_clock,
    get_period_start_date,
    get_pipeline_overview_data,
)
from app.services.workspace import utc

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/breakdowns")
async def breakdowns(
    db: DB,
    user: Owner,
    period: str = "30d",
    as_of: datetime | None = None,
    zone: str | None = Depends(get_request_time_zone),
):
    instant, time_zone = analytics_clock(user, zone, as_of)
    data = await get_pipeline_overview_data(
        db, user.id, period, as_of=instant, time_zone=time_zone
    )
    fields = (
        "scope",
        "current_record_basis",
        "first_response",
        "repeated_requirements",
        "missing_evidence",
        "rejected_count",
        "current_phases",
        "outcomes_by_source",
        "top_positions",
        "top_technologies",
        "stage_averages",
    )
    return {**{field: data[field] for field in fields}, "as_of": instant}


@router.get("/history")
async def history(
    db: DB,
    user: Owner,
    period: str = "30d",
    as_of: datetime | None = None,
    page: Page = 1,
    per_page: PerPage = 25,
    zone: str | None = Depends(get_request_time_zone),
):
    instant, zone_name = analytics_clock(user, zone, as_of)
    start = get_period_start_date(
        period, today=instant.astimezone(ZoneInfo(zone_name)).date()
    )
    status = (
        select(
            ApplicationStatusHistory.id.label("id"),
            literal("status.changed").label("event"),
            ApplicationStatusHistory.changed_at.label("occurred_at"),
            Application.id.label("application_id"),
            literal(None, String).label("round_id"),
            literal(None, String).label("details"),
        )
        .join(Application)
        .where(
            Application.user_id == user.id, ApplicationStatusHistory.is_gap.is_(False)
        )
    )
    rounds = [
        select(
            Round.id.label("id"),
            literal(event).label("event"),
            getattr(Round, field).label("occurred_at"),
            Round.application_id.label("application_id"),
            Round.id.label("round_id"),
            literal(None, String).label("details"),
        )
        .join(Application)
        .where(Application.user_id == user.id, getattr(Round, field).is_not(None))
        for field, event in (
            ("scheduled_at", "round.scheduled"),
            ("completed_at", "round.completed"),
        )
    ]
    audits = select(
        cast(AuditLog.id, String).label("id"),
        AuditLog.event_type.label("event"),
        AuditLog.created_at.label("occurred_at"),
        literal(None, String).label("application_id"),
        literal(None, String).label("round_id"),
        AuditLog.details.label("details"),
    ).where(AuditLog.user_id == user.id, AuditLog.event_type.like("workspace.%"))
    events = union_all(status, *rounds, audits).subquery()
    query = select(events).where(events.c.occurred_at <= instant)
    if start:
        query = query.where(
            events.c.occurred_at >= datetime.combine(start, time(), ZoneInfo(zone_name))
        )
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await db.execute(
            query.order_by(events.c.occurred_at.desc(), events.c.id, events.c.event)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).mappings()
    items = []
    for row in rows:
        item = dict(row)
        details = item.pop("details")
        item["occurred_at"] = utc(item["occurred_at"])
        item["target_type"] = "round" if item["round_id"] else "application"
        item["target_id"] = item["round_id"] or item["application_id"]
        if details:
            try:
                saved = json.loads(details)
            except (ValueError, TypeError):
                saved = {}
            if isinstance(saved, dict):
                for field in ("application_id", "round_id", "target_type", "target_id"):
                    if isinstance(saved.get(field), str):
                        item[field] = saved[field]
        items.append(item)
    # Labels are read from current owned records, never private audit payload text.
    labels = {}
    for kind, model, field in (
        ("application", Application, Application.company),
        ("company", Company, Company.name),
        ("contact", Contact, Contact.name),
        ("lead", JobLead, JobLead.company),
    ):
        ids = {item["target_id"] for item in items if item["target_type"] == kind}
        if ids:
            labels.update(
                ((kind, record_id), label)
                for record_id, label in await db.execute(
                    select(model.id, field).where(
                        model.user_id == user.id, model.id.in_(ids)
                    )
                )
            )
    round_ids = {item["target_id"] for item in items if item["target_type"] == "round"}
    if round_ids:
        labels.update(
            (("round", record_id), label)
            for record_id, label in await db.execute(
                select(Round.id, Application.company)
                .join(Application)
                .where(Application.user_id == user.id, Round.id.in_(round_ids))
            )
        )
    status_ids = [item["id"] for item in items if item["event"] == "status.changed"]
    transitions = {}
    if status_ids:
        for transition in await db.scalars(
            select(ApplicationStatusHistory)
            .join(Application)
            .where(
                Application.user_id == user.id,
                ApplicationStatusHistory.id.in_(status_ids),
            )
            .options(
                selectinload(ApplicationStatusHistory.from_status),
                selectinload(ApplicationStatusHistory.to_status),
            )
        ):
            transitions[transition.id] = {
                field: {"name": value.name, "builtin_key": value.builtin_key}
                if value and value.user_id in (None, user.id)
                else None
                for field, value in (
                    ("from_status", transition.from_status),
                    ("to_status", transition.to_status),
                )
            }
    for item in items:
        item["target_label"] = labels.get((item["target_type"], item["target_id"]))
        if item["event"] == "status.changed":
            item.update(transitions.get(item["id"], {}))
    return {"items": items, "total": total, "page": page, "per_page": per_page}
