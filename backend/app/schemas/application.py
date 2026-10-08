from datetime import UTC, date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.evidence import ApplicationEvidence, Meaning, ResponseEvidenceInput
from app.schemas.round import RoundResponse
from app.schemas.workspace import JobFields, JobFieldsResponse


class ApplicationExtractRequest(BaseModel):
    response_evidence: ResponseEvidenceInput | None = None
    """Request to extract job data from URL and create an application."""

    url: str = Field("", max_length=2048)
    status_id: str = Field(min_length=1, max_length=36)
    applied_at: date | None = None
    text: str | None = Field(None, max_length=100000)

    @field_validator("applied_at")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged/defaulted fields; null is not allowed")
        return value


class ApplicationCreate(JobFields):
    response_evidence: ResponseEvidenceInput | None = None
    company: str = Field("", max_length=255)
    job_title: str = Field("", max_length=255)
    job_description: str | None = None
    job_url: str | None = None
    status_id: str = Field(min_length=1, max_length=36)
    applied_at: date | None = None
    location: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str | None = None
    recruiter_name: str | None = None
    recruiter_title: str | None = None
    recruiter_linkedin_url: str | None = None
    requirements_must_have: list[str] = []
    requirements_nice_to_have: list[str] = []
    skills: list[str] = []
    years_experience_min: int | None = None
    years_experience_max: int | None = None
    source: str | None = None


class ApplicationUpdate(JobFields):
    archived: bool | None = None
    status_changed_at: datetime | None = None
    status_comment: str | None = Field(None, max_length=2000)
    status_reason: str | None = Field(None, max_length=2000)

    @field_validator("status_changed_at")
    @classmethod
    def status_time(cls, value):
        from app.schemas.evidence import HistoryCorrection

        return HistoryCorrection.validate_timestamp(value) if value else value

    expected_revision: int | None = Field(None, ge=0)
    response_evidence: ResponseEvidenceInput | None = None
    company: str | None = Field(None, max_length=255)
    job_title: str | None = Field(None, max_length=255)
    job_description: str | None = None
    job_url: str | None = None
    status_id: str | None = Field(None, min_length=1, max_length=36)
    applied_at: date | None = None
    location: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str | None = None
    recruiter_name: str | None = None
    recruiter_title: str | None = None
    recruiter_linkedin_url: str | None = None
    requirements_must_have: list[str] | None = None
    requirements_nice_to_have: list[str] | None = None
    skills: list[str] | None = None
    years_experience_min: int | None = None
    years_experience_max: int | None = None
    source: str | None = None

    @field_validator("company", "job_title", "status_id")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged/defaulted fields; null is not allowed")
        return value


class StatusResponse(BaseModel):
    builtin_key: str | None = None
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    color: str
    meaning: Meaning = "unknown"


class ApplicationListItem(ApplicationEvidence, JobFieldsResponse):
    pending_analysis_id: str | None = None
    posted_date: date | None = None
    archived_at: datetime | None = None
    outcome_reason: str | None = None
    source_text: str | None = None
    source_revision: int = 0
    model_config = ConfigDict(from_attributes=True)

    id: str
    company: str
    job_title: str
    job_description: str | None
    job_url: str | None
    status: StatusResponse
    cv_path: str | None
    cover_letter_path: str | None
    applied_at: date | None
    created_at: datetime
    updated_at: datetime
    job_lead_id: str | None
    location: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    recruiter_name: str | None
    recruiter_title: str | None
    recruiter_linkedin_url: str | None
    requirements_must_have: list[str] = []
    requirements_nice_to_have: list[str] = []
    skills: list[str] = []
    years_experience_min: int | None
    years_experience_max: int | None
    source: str | None

    @field_validator("created_at", "updated_at", "archived_at")
    @classmethod
    def application_dates_are_utc(cls, value: datetime | None) -> datetime | None:
        # SQLite drops the offset from UTC-normalized storage.
        return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value

    @field_validator(
        "requirements_must_have", "requirements_nice_to_have", "skills", mode="before"
    )
    @classmethod
    def convert_none_to_list(cls, v: Any) -> list[str]:
        """Convert None to empty list for database compatibility."""
        if v is None:
            return []
        return v


class ApplicationSummary(ApplicationListItem):
    """List-only aggregate; detail and mutation responses keep their own shape."""

    round_count: int = Field(
        ge=0,
        description="Total recorded interview rounds, including unfinished rounds.",
    )


class ApplicationResponse(ApplicationListItem):
    model_config = ConfigDict(from_attributes=True)

    rounds: list[RoundResponse] = []


class ApplicationListResponse(BaseModel):
    items: list[ApplicationSummary]
    total: int
    page: int
    per_page: int
