"""Owner-only address book, private notes and reminders."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user_jwt, get_request_time_zone
from app.models import Application, JobLead, Round, User
from app.models.workspace import (
    ApplicationContact,
    Company,
    Contact,
    Note,
    Reminder,
    RoundContact,
)
from app.schemas.application import ApplicationListItem
from app.schemas.round import RoundResponse
from app.schemas.workspace import (
    CompanyCreate,
    CompanyUpdate,
    ContactCreate,
    ContactLinks,
    ContactUpdate,
    NoteCreate,
    NoteUpdate,
    ReminderCreate,
    ReminderKind,
    ReminderState,
    ReminderUpdate,
    TargetType,
)
from app.services.workspace import (
    audit,
    change_record,
    contact_ids,
    link_contacts,
    owned,
    paged,
    record_dict,
    reminder_values,
    target_filter,
    targets_owned,
    utc,
)

router = APIRouter(prefix="/api", tags=["workspace"])
DB = Annotated[AsyncSession, Depends(get_db)]
Owner = Annotated[User, Depends(get_current_user_jwt)]
Page = Annotated[int, Query(ge=1)]
PerPage = Annotated[int, Query(ge=1, le=100)]


async def saved(db, user, row, event):
    await db.flush()
    await audit(db, user.id, event, row)
    await db.commit()
    from app.api.streak import record_streak_activity

    await record_streak_activity(user=user, db=db)
    await db.refresh(row)
    return record_dict(row)


@router.get("/companies")
async def companies(
    db: DB,
    user: Owner,
    query: str | None = None,
    industry: str | None = None,
    sort: Literal["name", "activity", "applications"] = "name",
    page: Page = 1,
    per_page: PerPage = 25,
):
    statement = select(Company).where(Company.user_id == user.id)
    if query:
        statement = statement.where(Company.name.ilike(f"%{query}%"))
    if industry:
        statement = statement.where(Company.industry == industry)
    app_count = (
        select(func.count())
        .select_from(Application)
        .where(Application.company_id == Company.id, Application.user_id == user.id)
        .correlate(Company)
        .scalar_subquery()
    )
    statement = statement.order_by(
        {
            "name": func.lower(Company.name),
            "activity": Company.updated_at.desc(),
            "applications": app_count.desc(),
        }[sort],
        Company.id,
    )
    result = await paged(db, statement, page, per_page)
    for row in result["items"]:
        row.update(await company_counts(db, user.id, row["id"]))
    return result


async def company_counts(db, user_id, company_id):
    result = {}
    for key, model in (
        ("lead_count", JobLead),
        ("application_count", Application),
        ("contact_count", Contact),
    ):
        result[key] = (
            await db.scalar(
                select(func.count())
                .select_from(model)
                .where(model.user_id == user_id, model.company_id == company_id)
            )
            or 0
        )
    return result


@router.post("/companies", status_code=201)
async def create_company(data: CompanyCreate, db: DB, user: Owner):
    row = Company(user_id=user.id, **data.model_dump())
    db.add(row)
    return await saved(db, user, row, "company.created")


@router.get("/companies/{record_id}")
async def company_detail(record_id: str, db: DB, user: Owner):
    row = await owned(db, Company, record_id, user.id)
    result = record_dict(row)
    result.update(await company_counts(db, user.id, row.id))
    for field, model in (
        ("contacts", Contact),
        ("leads", JobLead),
    ):
        result[field] = (
            await paged(
                db,
                select(model)
                .where(model.user_id == user.id, model.company_id == row.id)
                .order_by(model.id),
                1,
                100,
            )
        )["items"]
    result["applications"] = [
        ApplicationListItem.model_validate(app).model_dump()
        for app in await db.scalars(
            select(Application)
            .where(Application.user_id == user.id, Application.company_id == row.id)
            .options(selectinload(Application.status))
            .order_by(Application.updated_at.desc())
            .limit(100)
        )
    ]
    return result


@router.patch("/companies/{record_id}")
async def update_company(record_id: str, data: CompanyUpdate, db: DB, user: Owner):
    row = await owned(db, Company, record_id, user.id)
    await change_record(
        db,
        row,
        user.id,
        data.expected_revision,
        data.model_dump(exclude_unset=True, exclude={"expected_revision"}),
    )
    return await saved(db, user, row, "company.updated")


@router.delete("/companies/{record_id}", status_code=204)
async def delete_company(
    record_id: str, db: DB, user: Owner, expected_revision: int = Query(ge=0)
):
    row = await owned(db, Company, record_id, user.id)
    await change_record(db, row, user.id, expected_revision, {})
    await audit(db, user.id, "company.deleted", row)
    await db.delete(row)
    await db.commit()


@router.get("/contacts")
async def contacts(
    db: DB,
    user: Owner,
    query: str | None = None,
    company_id: str | None = None,
    role: str | None = None,
    page: Page = 1,
    per_page: PerPage = 25,
):
    statement = select(Contact).where(Contact.user_id == user.id)
    if query:
        statement = statement.where(
            or_(
                Contact.name.ilike(f"%{query}%"),
                Contact.email.ilike(f"%{query}%"),
                Contact.function.ilike(f"%{query}%"),
            )
        )
    if company_id:
        statement = statement.where(Contact.company_id == company_id)
    if role:
        statement = statement.where(Contact.role == role)
    return await paged(
        db, statement.order_by(func.lower(Contact.name), Contact.id), page, per_page
    )


@router.post("/contacts", status_code=201)
async def create_contact(data: ContactCreate, db: DB, user: Owner):
    if data.company_id:
        await owned(db, Company, data.company_id, user.id)
    row = Contact(user_id=user.id, **data.model_dump())
    db.add(row)
    return await saved(db, user, row, "contact.created")


@router.get("/contacts/{record_id}")
async def contact_detail(record_id: str, db: DB, user: Owner):
    row = await owned(db, Contact, record_id, user.id)
    result = record_dict(row)
    result["company"] = (
        record_dict(await owned(db, Company, row.company_id, user.id))
        if row.company_id
        else None
    )
    result["applications"] = [
        ApplicationListItem.model_validate(app).model_dump()
        for app in await db.scalars(
            select(Application)
            .join(
                ApplicationContact, ApplicationContact.application_id == Application.id
            )
            .where(
                Application.user_id == user.id,
                ApplicationContact.user_id == user.id,
                ApplicationContact.contact_id == row.id,
            )
            .options(selectinload(Application.status))
            .limit(100)
        )
    ]
    result["rounds"] = [
        RoundResponse.model_validate(rnd).model_dump()
        for rnd in await db.scalars(
            select(Round)
            .join(Application)
            .join(RoundContact, RoundContact.round_id == Round.id)
            .where(
                Application.user_id == user.id,
                RoundContact.user_id == user.id,
                RoundContact.contact_id == row.id,
            )
            .options(selectinload(Round.round_type), selectinload(Round.media))
            .limit(100)
        )
    ]
    return result


@router.patch("/contacts/{record_id}")
async def update_contact(record_id: str, data: ContactUpdate, db: DB, user: Owner):
    row = await owned(db, Contact, record_id, user.id)
    if data.company_id:
        await owned(db, Company, data.company_id, user.id)
    await change_record(
        db,
        row,
        user.id,
        data.expected_revision,
        data.model_dump(exclude_unset=True, exclude={"expected_revision"}),
    )
    return await saved(db, user, row, "contact.updated")


@router.delete("/contacts/{record_id}", status_code=204)
async def delete_contact(
    record_id: str, db: DB, user: Owner, expected_revision: int = Query(ge=0)
):
    row = await owned(db, Contact, record_id, user.id)
    await change_record(db, row, user.id, expected_revision, {})
    await audit(db, user.id, "contact.deleted", row)
    await db.delete(row)
    await db.commit()


@router.get("/applications/{record_id}/contacts")
async def application_contacts(record_id: str, db: DB, user: Owner):
    row = await owned(db, Application, record_id, user.id)
    return {
        "contact_ids": await contact_ids(db, row, user.id),
        "revision": row.evidence_revision,
    }


@router.put("/applications/{record_id}/contacts")
async def put_application_contacts(
    record_id: str, data: ContactLinks, db: DB, user: Owner
):
    row = await owned(db, Application, record_id, user.id)
    values = (
        {"recruiter_contact_id": None}
        if row.recruiter_contact_id not in data.contact_ids
        else {}
    )
    await change_record(db, row, user.id, data.expected_revision, values)
    await link_contacts(db, row, user.id, data.contact_ids)
    await audit(db, user.id, "application.contacts", row)
    await db.commit()
    return {
        "contact_ids": await contact_ids(db, row, user.id),
        "revision": row.evidence_revision,
    }


@router.get("/rounds/{record_id}/contacts")
async def round_contacts(record_id: str, db: DB, user: Owner):
    row = await owned(db, Round, record_id, user.id)
    return {
        "contact_ids": await contact_ids(db, row, user.id),
        "revision": row.revision,
    }


@router.put("/rounds/{record_id}/contacts")
async def put_round_contacts(record_id: str, data: ContactLinks, db: DB, user: Owner):
    row = await owned(db, Round, record_id, user.id)
    await change_record(db, row, user.id, data.expected_revision, {})
    await link_contacts(db, row, user.id, data.contact_ids)
    await audit(db, user.id, "round.contacts", row)
    await db.commit()
    return {
        "contact_ids": await contact_ids(db, row, user.id),
        "revision": row.revision,
    }


@router.get("/notes")
async def notes(
    db: DB,
    user: Owner,
    target_type: TargetType,
    target_id: str,
    page: Page = 1,
    per_page: PerPage = 25,
):
    await targets_owned(db, user.id, {target_type + "_id": target_id}, True)
    query = target_filter(
        select(Note).where(Note.user_id == user.id), Note, target_type, target_id
    ).order_by(Note.created_at.desc(), Note.id)
    return await paged(db, query, page, per_page)


@router.post("/notes", status_code=201)
async def create_note(data: NoteCreate, db: DB, user: Owner):
    values = data.model_dump()
    await targets_owned(db, user.id, values, True)
    row = Note(user_id=user.id, **values)
    db.add(row)
    return await saved(db, user, row, "note.created")


@router.patch("/notes/{record_id}")
async def update_note(record_id: str, data: NoteUpdate, db: DB, user: Owner):
    row = await owned(db, Note, record_id, user.id)
    await change_record(db, row, user.id, data.expected_revision, {"body": data.body})
    return await saved(db, user, row, "note.updated")


@router.delete("/notes/{record_id}", status_code=204)
async def delete_note(
    record_id: str, db: DB, user: Owner, expected_revision: int = Query(ge=0)
):
    row = await owned(db, Note, record_id, user.id)
    await change_record(db, row, user.id, expected_revision, {})
    await audit(db, user.id, "note.deleted", row)
    await db.delete(row)
    await db.commit()


@router.get("/reminders")
async def reminders(
    db: DB,
    user: Owner,
    target_type: TargetType | None = None,
    target_id: str | None = None,
    kind: ReminderKind | None = None,
    state: ReminderState | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    overdue: bool = False,
    page: Page = 1,
    per_page: PerPage = 25,
):
    query = target_filter(
        select(Reminder).where(Reminder.user_id == user.id),
        Reminder,
        target_type,
        target_id,
    )
    if target_type and target_id:
        await targets_owned(db, user.id, {target_type + "_id": target_id})
    if kind:
        query = query.where(Reminder.kind == kind)
    if state:
        query = query.where(Reminder.state == state)
    if due_from:
        query = query.where(Reminder.due_at >= utc(due_from))
    if due_to:
        query = query.where(Reminder.due_at <= utc(due_to))
    if overdue:
        query = query.where(
            Reminder.state == "open", Reminder.due_at < datetime.now(UTC)
        )
    return await paged(
        db,
        query.order_by((Reminder.state != "open"), Reminder.due_at, Reminder.id),
        page,
        per_page,
    )


@router.post("/reminders", status_code=201)
async def create_reminder(
    data: ReminderCreate,
    db: DB,
    user: Owner,
    zone: str | None = Depends(get_request_time_zone),
):
    row = await db.scalar(
        select(Reminder).where(
            Reminder.user_id == user.id, Reminder.intent_id == str(data.intent_id)
        )
    )
    values = reminder_values(data, user, zone, row)
    await targets_owned(db, user.id, values)
    if row:
        for key, value in values.items():
            stored = getattr(row, key)
            if (utc(stored) if isinstance(stored, datetime) else stored) != value:
                raise HTTPException(
                    409, "Reminder intent already used with different content"
                )
        return record_dict(row)
    row = Reminder(user_id=user.id, **values)
    db.add(row)
    try:
        return await saved(db, user, row, "reminder.created")
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(
            select(Reminder).where(
                Reminder.user_id == user.id, Reminder.intent_id == str(data.intent_id)
            )
        )
        if existing and all(
            (utc(v) if isinstance(v := getattr(existing, key), datetime) else v)
            == value
            for key, value in values.items()
        ):
            return record_dict(existing)
        raise HTTPException(409, "Reminder intent already used") from None


@router.patch("/reminders/{record_id}")
async def update_reminder(
    record_id: str,
    data: ReminderUpdate,
    db: DB,
    user: Owner,
    zone: str | None = Depends(get_request_time_zone),
):
    row = await owned(db, Reminder, record_id, user.id)
    values = reminder_values(data, user, zone, row)
    await targets_owned(db, user.id, {**record_dict(row), **values})
    await change_record(db, row, user.id, data.expected_revision, values)
    return await saved(db, user, row, "reminder.updated")


@router.delete("/reminders/{record_id}", status_code=204)
async def delete_reminder(
    record_id: str, db: DB, user: Owner, expected_revision: int = Query(ge=0)
):
    row = await owned(db, Reminder, record_id, user.id)
    await change_record(db, row, user.id, expected_revision, {})
    await audit(db, user.id, "reminder.deleted", row)
    await db.delete(row)
    await db.commit()
