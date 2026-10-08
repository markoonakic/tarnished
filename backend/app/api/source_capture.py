"""Explicit saved-posting replacement and safe, read-only fetch previews."""

from fastapi import APIRouter, HTTPException

from app.api.workspace import DB, Owner
from app.models import Application, JobLead
from app.schemas.application import ApplicationListItem
from app.schemas.job_lead import JobLeadResponse
from app.schemas.workspace import SourceUpdate
from app.services.application_evidence import compare_and_set_application
from app.services.interview_jobs import invalidate_interviews
from app.services.job_fetch import fetch_job_posting_html
from app.services.lead_capture import capture_complete_source
from app.services.workspace import audit, change_record, owned

router = APIRouter(prefix="/api", tags=["source"])


async def preview(row):
    url = row.url if isinstance(row, JobLead) else row.job_url
    if not url:
        raise HTTPException(422, "Add a URL before fetching")
    content = capture_complete_source(html=await fetch_job_posting_html(url))
    return {
        "text": content["source_text"] or "",
        "url": url,
        "truncated": content["source_truncated"],
        "warning": content["content_warning"],
    }


@router.post("/job-leads/{record_id}/fetch-source")
async def fetch_lead_source(record_id: str, db: DB, user: Owner):
    return await preview(await owned(db, JobLead, record_id, user.id))


@router.post("/applications/{record_id}/fetch-source")
async def fetch_application_source(record_id: str, db: DB, user: Owner):
    return await preview(await owned(db, Application, record_id, user.id))


@router.put("/job-leads/{record_id}/source", response_model=JobLeadResponse)
async def replace_lead_source(record_id: str, data: SourceUpdate, db: DB, user: Owner):
    row = await owned(db, JobLead, record_id, user.id)
    values = capture_complete_source(data.text)
    values.update(
        processing_started_at=None,
        status="converted" if row.converted_to_application_id else "pending",
        error_message=None,
    )
    await change_record(db, row, user.id, data.expected_revision, values)
    await audit(db, user.id, "lead.source", row)
    await db.commit()
    return row


@router.put("/applications/{record_id}/source", response_model=ApplicationListItem)
async def replace_application_source(
    record_id: str, data: SourceUpdate, db: DB, user: Owner
):
    row = await owned(db, Application, record_id, user.id)
    captured = capture_complete_source(data.text)
    await compare_and_set_application(
        db,
        row,
        {
            "source_text": captured["source_text"],
            "source_revision": row.source_revision + 1,
        },
        data.expected_revision,
    )
    await invalidate_interviews(db, application_id=row.id, removed=True)
    await audit(db, user.id, "application.source", row)
    await db.commit()
    await db.refresh(
        row,
        attribute_names=[
            "status",
            "source_text",
            "source_revision",
            "evidence_revision",
        ],
    )
    return row
