"""Small shared owner, revision, target and activity helpers."""

import json
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import selectinload

from app.models import Application, AuditLog, JobLead, Round
from app.models.workspace import (
    ApplicationContact,
    Company,
    Contact,
    Reminder,
    RoundContact,
)
from app.services.user_time import get_effective_time_zone_name

TARGETS = {
    "lead": JobLead,
    "application": Application,
    "company": Company,
    "contact": Contact,
    "round": Round,
}
JOB_FIELDS = (
    "company_id",
    "recruiter_contact_id",
    "work_mode",
    "employment_type",
    "seniority",
    "deadline",
    "pay_period",
    "priority",
    "tags",
)


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def record_dict(row, exclude=()):
    return {
        column.key: utc(value)
        if isinstance(value := getattr(row, column.key), datetime)
        else value
        for column in row.__table__.columns
        if column.key not in exclude
    }


async def owned(db, model, record_id, user_id):
    query = select(model).where(model.id == record_id)
    if model is Round:
        query = (
            query.join(Application)
            .where(Application.user_id == user_id)
            .options(selectinload(Round.round_type), selectinload(Round.media))
        )
    else:
        query = query.where(model.user_id == user_id)
    row = await db.scalar(query.execution_options(populate_existing=True))
    if row is None:
        raise HTTPException(404, "Record not found")
    return row


async def paged(db, query, page, per_page):
    total = (
        await db.scalar(
            select(func.count()).select_from(query.order_by(None).subquery())
        )
        or 0
    )
    rows = (await db.scalars(query.offset((page - 1) * per_page).limit(per_page))).all()
    return {
        "items": [record_dict(row) for row in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


async def targets_owned(db, user_id, values, exactly_one=False):
    targets = [
        (name, values.get(name + "_id"))
        for name in TARGETS
        if values.get(name + "_id") is not None
    ]
    if len(targets) > 1 or (exactly_one and len(targets) != 1):
        raise HTTPException(422, "Invalid target count")
    for name, record_id in targets:
        await owned(db, TARGETS[name], record_id, user_id)


def target_filter(query, model, target_type, target_id):
    if bool(target_type) != bool(target_id):
        raise HTTPException(422, "Set both target_type and target_id")
    return (
        query.where(getattr(model, target_type + "_id") == target_id)
        if target_type
        else query
    )


async def job_links(db, user_id, values, existing=None):
    if values.get("company_id"):
        company = await owned(db, Company, values["company_id"], user_id)
        values["company"] = company.name
    if values.get("recruiter_contact_id"):
        await owned(db, Contact, values["recruiter_contact_id"], user_id)
    # Old inline writes create a snapshot contact; they never edit a shared contact.
    legacy = ("recruiter_name", "recruiter_title", "recruiter_linkedin_url")
    if "recruiter_contact_id" not in values and any(key in values for key in legacy):
        fields = {key: values.get(key, getattr(existing, key, None)) for key in legacy}
        if any(fields.values()):
            contact = Contact(
                user_id=user_id,
                name=fields["recruiter_name"]
                or fields["recruiter_title"]
                or "Recruiter",
                function=fields["recruiter_title"],
                profile_url=fields["recruiter_linkedin_url"],
                role="Recruiter",
                company_id=values.get(
                    "company_id", getattr(existing, "company_id", None)
                ),
            )
            db.add(contact)
            await db.flush()
            values["recruiter_contact_id"] = contact.id
        else:
            values["recruiter_contact_id"] = None


async def audit(db, user_id, event, row):
    kind = next(
        (name for name, model in TARGETS.items() if isinstance(row, model)),
        row.__tablename__,
    )
    details = {"target_type": kind, "target_id": row.id}
    if isinstance(row, Round):
        details["application_id"] = row.application_id
        details["round_id"] = row.id
    elif isinstance(row, Application):
        details["application_id"] = row.id
    else:
        details.update(
            {
                name + "_id": getattr(row, name + "_id")
                for name in TARGETS
                if getattr(row, name + "_id", None)
            }
        )
    if kind not in TARGETS:
        for target in TARGETS:
            if details.get(target + "_id"):
                details.update(target_type=target, target_id=details[target + "_id"])
                break
    db.add(
        AuditLog(
            user_id=user_id,
            event_type="workspace." + event,
            details=json.dumps(details),
        )
    )
    parent_id = details.get("application_id")
    if not parent_id and details.get("round_id"):
        parent_id = await db.scalar(
            select(Round.application_id)
            .join(Application)
            .where(Round.id == details["round_id"], Application.user_id == user_id)
        )
    if parent_id:
        await db.execute(
            update(Application)
            .where(Application.id == parent_id, Application.user_id == user_id)
            .values(updated_at=datetime.now(UTC))
        )
    contact_id = (
        row.id if isinstance(row, Contact) else getattr(row, "contact_id", None)
    )
    company_id = (
        row.id if isinstance(row, Company) else getattr(row, "company_id", None)
    )
    if contact_id:
        company_id = company_id or await db.scalar(
            select(Contact.company_id).where(
                Contact.id == contact_id, Contact.user_id == user_id
            )
        )
        await db.execute(
            update(Contact)
            .where(Contact.id == contact_id, Contact.user_id == user_id)
            .values(updated_at=datetime.now(UTC))
        )
    if parent_id and not company_id:
        company_id = await db.scalar(
            select(Application.company_id).where(
                Application.id == parent_id, Application.user_id == user_id
            )
        )
    if company_id:
        await db.execute(
            update(Company)
            .where(Company.id == company_id, Company.user_id == user_id)
            .values(updated_at=datetime.now(UTC))
        )


async def change_record(db, row, user_id, expected_revision, values):
    model = type(row)
    revision_field = "evidence_revision" if model is Application else "revision"
    revision = getattr(row, revision_field)
    if expected_revision != revision:
        raise HTTPException(409, "Record changed; reload and retry")
    conditions = [model.id == row.id, getattr(model, revision_field) == revision]
    conditions.append(
        model.application_id.in_(
            select(Application.id).where(Application.user_id == user_id)
        )
        if model is Round
        else model.user_id == user_id
    )
    changed = await db.scalar(
        update(model)
        .where(*conditions)
        .values(**values, **{revision_field: revision + 1})
        .returning(model.id)
        .execution_options(synchronize_session=False)
    )
    if changed is None:
        raise HTTPException(409, "Record changed; reload and retry")
    await db.refresh(row)
    return row


async def link_contacts(db, row, user_id, contact_ids):
    for contact_id in set(contact_ids):
        await owned(db, Contact, contact_id, user_id)
    link_model, field = (
        (RoundContact, "round_id")
        if isinstance(row, Round)
        else (ApplicationContact, "application_id")
    )
    await db.execute(
        delete(link_model).where(
            link_model.user_id == user_id, getattr(link_model, field) == row.id
        )
    )
    for contact_id in set(contact_ids):
        db.add(link_model(user_id=user_id, contact_id=contact_id, **{field: row.id}))


async def contact_ids(db, row, user_id):
    model, field = (
        (RoundContact, "round_id")
        if isinstance(row, Round)
        else (ApplicationContact, "application_id")
    )
    return list(
        await db.scalars(
            select(model.contact_id).where(
                model.user_id == user_id, getattr(model, field) == row.id
            )
        )
    )


def reminder_values(data, user, request_zone=None, existing=None):
    values = data.model_dump(
        exclude_unset=True, exclude={"expected_revision", "due_date", "due_time"}
    )
    zone = (
        values.get("time_zone")
        or getattr(existing, "time_zone", None)
        or get_effective_time_zone_name(user, x_timezone=request_zone)
        or "UTC"
    )
    values["time_zone"] = zone
    if data.due_date is not None or data.due_time is not None:
        if data.due_date is None or data.due_time is None or data.due_at is not None:
            raise HTTPException(422, "Set due_at or a date and time, not both")
        wall = datetime.combine(data.due_date, data.due_time).replace(tzinfo=None)
        local = wall.replace(tzinfo=ZoneInfo(zone))
        instant = local.astimezone(UTC)
        if instant.astimezone(local.tzinfo).replace(tzinfo=None) != wall:
            raise HTTPException(422, "This local time does not exist")
        if local.utcoffset() != local.replace(fold=1).utcoffset():
            raise HTTPException(
                422, "This local time is ambiguous; provide an explicit offset"
            )
        values["due_at"] = instant
    if values.get("intent_id"):
        values["intent_id"] = str(values["intent_id"])
    if values.get("state"):
        values["completed_at"] = (
            datetime.now(UTC) if values["state"] == "done" else None
        )
    return values


async def reminder_badge(db, user, request_zone=None):
    now = datetime.now(UTC)
    zone = ZoneInfo(
        get_effective_time_zone_name(user, x_timezone=request_zone) or "UTC"
    )
    today = now.astimezone(zone).date()
    tomorrow = datetime.combine(today + timedelta(days=1), time(), zone).astimezone(UTC)
    base = (
        select(func.count())
        .select_from(Reminder)
        .where(Reminder.user_id == user.id, Reminder.state == "open")
    )
    overdue = await db.scalar(base.where(Reminder.due_at < now)) or 0
    due_today = (
        await db.scalar(base.where(Reminder.due_at >= now, Reminder.due_at < tomorrow))
        or 0
    )
    return {"overdue": overdue, "due_today": due_today, "total": overdue + due_today}
