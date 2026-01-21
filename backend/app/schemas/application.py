from datetime import date, datetime

from pydantic import BaseModel


class ApplicationCreate(BaseModel):
    company: str
    job_title: str
    job_description: str | None = None
    job_url: str | None = None
    status_id: str
    applied_at: date | None = None


class ApplicationUpdate(BaseModel):
    company: str | None = None
    job_title: str | None = None
    job_description: str | None = None
    job_url: str | None = None
    status_id: str | None = None
    applied_at: date | None = None
    transcript_summary: str | None = None


class StatusResponse(BaseModel):
    id: str
    name: str
    color: str

    class Config:
        from_attributes = True


class ApplicationResponse(BaseModel):
    id: str
    company: str
    job_title: str
    job_description: str | None
    job_url: str | None
    status: StatusResponse
    cv_path: str | None
    cover_letter_path: str | None
    transcript_path: str | None
    transcript_summary: str | None
    applied_at: date
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ApplicationListResponse(BaseModel):
    items: list[ApplicationResponse]
    total: int
    page: int
    per_page: int
