"""One SQL filter contract for lists and board columns."""

import json
from datetime import datetime, time, timedelta
from typing import Annotated, Literal

from fastapi import HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import String, cast, or_

from app.models import Application, JobLead


class JobFilters(BaseModel):
    company_id: str | None = None
    location: str | None = None
    work_mode: str | None = None
    employment_type: str | None = None
    seniority: str | None = None
    priority: str | None = None
    tags: list[str] = []
    date_field: str | None = None
    show_archived: bool = False
    decision: Literal["interesting", "rejected", "archived", "undecided"] | None = None


def filter_params(
    company_id: str | None = None,
    location: str | None = None,
    work_mode: str | None = None,
    employment_type: str | None = None,
    seniority: str | None = None,
    priority: str | None = None,
    tags: Annotated[list[str] | None, Query()] = None,
    date_field: str | None = None,
    show_archived: bool = False,
    decision: Literal["interesting", "rejected", "archived", "undecided"] | None = None,
):
    return JobFilters(
        company_id=company_id,
        location=location,
        work_mode=work_mode,
        employment_type=employment_type,
        seniority=seniority,
        priority=priority,
        tags=tags or [],
        date_field=date_field,
        show_archived=show_archived,
        decision=decision,
    )


def apply_filters(query, model, filters, date_from=None, date_to=None):
    for field in (
        "company_id",
        "work_mode",
        "employment_type",
        "seniority",
        "priority",
    ):
        value = getattr(filters, field)
        if value:
            query = query.where(getattr(model, field) == value)
    if filters.location:
        query = query.where(model.location.ilike(f"%{filters.location}%"))
    for tag in filters.tags:
        literal = (
            json.dumps(tag, ensure_ascii=False)
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        query = query.where(cast(model.tags, String).like(f"%{literal}%", escape="\\"))
    if model is JobLead:
        if filters.decision:
            query = query.where(
                JobLead.decision.is_(None)
                if filters.decision == "undecided"
                else JobLead.decision == filters.decision
            )
        elif not filters.show_archived:
            query = query.where(
                or_(JobLead.decision.is_(None), JobLead.decision == "interesting")
            )
        fields = {
            "added": JobLead.scraped_at,
            "posted": JobLead.posted_date,
            "deadline": JobLead.deadline,
            "updated": JobLead.updated_at,
        }
        default = "added"
    else:
        if not filters.show_archived:
            query = query.where(Application.archived_at.is_(None))
        fields = {
            "applied": Application.applied_at,
            "created": Application.created_at,
            "updated": Application.updated_at,
            "deadline": Application.deadline,
        }
        default = "applied"
    if filters.date_field and filters.date_field not in fields:
        raise HTTPException(422, "Invalid date field")
    column = fields[filters.date_field or default]
    if date_from:
        query = query.where(column >= date_from)
    if date_to:
        # A date includes the whole final day, including timestamps.
        query = query.where(
            column < datetime.combine(date_to + timedelta(days=1), time())
            if (filters.date_field or default) in ("added", "updated", "created")
            else column <= date_to
        )
    return query
