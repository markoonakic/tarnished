"""Validated inputs shared by workspace routes and portable archives."""

import json
from datetime import UTC, date, datetime, time
from typing import Annotated, Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ShortText = Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]
TargetType = Literal["lead", "application", "company", "contact", "round"]
ReminderKind = Literal[
    "application_deadline",
    "reply_to_company",
    "interview",
    "interview_preparation",
    "task_submission",
    "recruiter_follow_up",
    "expected_feedback",
]
ReminderState = Literal["open", "done", "dismissed"]
WorkMode = Literal["office", "hybrid", "remote", "other"]
EmploymentType = Literal[
    "full_time", "part_time", "contract", "internship", "temporary", "other"
]
PayPeriod = Literal["hour", "day", "week", "month", "year", "other"]
Priority = Literal["low", "normal", "high"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def bounded_json(self):
        encoded = json.dumps(self.model_dump(mode="json"), ensure_ascii=False)
        if len(encoded) > 200_000 or "\\u0000" in encoded:
            raise ValueError("Content exceeds 200000 characters or contains NUL")
        return self


class Revision(Input):
    expected_revision: int = Field(ge=0)


class CompanyFields(Input):
    name: ShortText | None = None
    website: str | None = Field(None, max_length=2048)
    industry: str | None = Field(None, max_length=255)
    location: str | None = Field(None, max_length=255)
    size: Literal["1-10", "11-50", "51-200", "201-1000", "1000+"] | None = None
    description: str | None = Field(None, max_length=20_000)
    culture_notes: str | None = Field(None, max_length=20_000)

    @field_validator("name")
    @classmethod
    def non_null_name(cls, value):
        if value is None:
            raise ValueError("Name cannot be null")
        return value.strip()

    @field_validator("website")
    @classmethod
    def public_link(cls, value):
        if value and not value.startswith(("http://", "https://")):
            raise ValueError("Use an HTTP(S) URL")
        return value


class CompanyCreate(CompanyFields):
    name: ShortText


class CompanyUpdate(CompanyFields, Revision):
    pass


class ContactFields(Input):
    name: ShortText | None = None
    function: str | None = Field(None, max_length=255)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=100)
    profile_url: str | None = Field(None, max_length=2048)
    role: str | None = Field(None, max_length=100)
    last_contact_on: date | None = None
    communication_note: str | None = Field(None, max_length=20_000)
    company_id: str | None = Field(None, max_length=36)

    @field_validator("name")
    @classmethod
    def non_null_name(cls, value):
        return CompanyFields.non_null_name(value)

    @field_validator("profile_url")
    @classmethod
    def public_link(cls, value):
        return CompanyFields.public_link(value)


class ContactCreate(ContactFields):
    name: ShortText


class ContactUpdate(ContactFields, Revision):
    pass


class TargetFields(Input):
    lead_id: str | None = Field(None, max_length=36)
    application_id: str | None = Field(None, max_length=36)
    company_id: str | None = Field(None, max_length=36)
    contact_id: str | None = Field(None, max_length=36)
    round_id: str | None = Field(None, max_length=36)

    @model_validator(mode="after")
    def single_target(self):
        if sum(getattr(self, key) is not None for key in TargetFields.model_fields) > 1:
            raise ValueError("At most one target is allowed")
        return self


class NoteCreate(TargetFields):
    body: str = Field(min_length=1, max_length=50_000, pattern=r"\S")

    @model_validator(mode="after")
    def require_target(self):
        if not any(getattr(self, key) for key in TargetFields.model_fields):
            raise ValueError("A note requires one target")
        return self


class NoteUpdate(Revision):
    body: str = Field(min_length=1, max_length=50_000, pattern=r"\S")


class ReminderFields(TargetFields):
    kind: ReminderKind | None = None
    title: ShortText | None = None
    note: str | None = Field(None, max_length=20_000)
    due_at: datetime | None = None
    due_date: date | None = None
    due_time: time | None = None
    time_zone: str | None = Field(None, max_length=100)

    @field_validator("due_at")
    @classmethod
    def offset_required(cls, value):
        if value is None or value.tzinfo is None:
            raise ValueError("An explicit timezone offset is required")
        return value.astimezone(UTC)

    @field_validator("time_zone")
    @classmethod
    def valid_zone(cls, value):
        if value:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError):
                raise ValueError("Invalid IANA time zone") from None
        return value

    @field_validator("kind", "title")
    @classmethod
    def required_when_set(cls, value):
        if value is None:
            raise ValueError("Field cannot be null")
        return value


class ReminderCreate(ReminderFields):
    kind: ReminderKind
    title: ShortText
    intent_id: UUID

    @model_validator(mode="after")
    def require_due(self):
        if self.due_at is None and (self.due_date is None or self.due_time is None):
            raise ValueError("Set due_at or both due_date and due_time")
        return self


class ReminderUpdate(ReminderFields, Revision):
    state: ReminderState | None = None

    @field_validator("state")
    @classmethod
    def required_state(cls, value):
        return cls.required_when_set(value)


class ContactLinks(Revision):
    contact_ids: list[str] = Field(max_length=100)


class JobFields(BaseModel):
    company_id: str | None = Field(None, max_length=36)
    recruiter_contact_id: str | None = Field(None, max_length=36)
    work_mode: WorkMode | None = None
    employment_type: EmploymentType | None = None
    seniority: str | None = Field(None, max_length=50)
    deadline: date | None = None
    pay_period: PayPeriod | None = None
    priority: Priority = "normal"
    tags: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=50
    )


class JobFieldsResponse(JobFields):
    confirmed_requirements: list[dict[str, Any]] = Field(default_factory=list)
    requirements_revision: int = 0


PREPARATION_KEYS = (
    "review_topics",
    "technical_topics",
    "practice_questions",
    "company_questions",
    "examples",
    "profile_gaps",
    "plan",
)


class InterviewFields(BaseModel):
    time_zone: str | None = Field(None, max_length=100)
    duration_minutes: int | None = Field(None, ge=1, le=1440)
    mode: Literal["onsite", "video", "phone", "other"] | None = None
    location: str | None = Field(None, max_length=500)
    meeting_url: str | None = Field(None, max_length=2048)
    preparation: dict[str, list[str]] = Field(default_factory=dict)
    questions_answers: list[dict[str, str]] = Field(
        default_factory=list, max_length=100
    )
    impressions: str | None = Field(None, max_length=20_000)
    task_description: str | None = Field(None, max_length=50_000)
    task_deadline: datetime | None = None
    next_steps: str | None = Field(None, max_length=20_000)
    expected_reply_on: date | None = None
    contact_ids: list[str] | None = Field(None, max_length=100)

    @field_validator("time_zone")
    @classmethod
    def valid_zone(cls, value):
        return ReminderFields.valid_zone(value)

    @field_validator("meeting_url")
    @classmethod
    def valid_link(cls, value):
        return CompanyFields.public_link(value)

    @field_validator("task_deadline")
    @classmethod
    def utc_deadline(cls, value):
        return ReminderFields.offset_required(value) if value is not None else None

    @field_validator("preparation")
    @classmethod
    def valid_preparation(cls, value):
        if set(value) - set(PREPARATION_KEYS) or any(
            len(items) > 100 or any(len(item) > 2000 for item in items)
            for items in value.values()
        ):
            raise ValueError(
                "Invalid preparation lists (maximum 100 items, 2000 characters each)"
            )
        return value

    @field_validator("questions_answers")
    @classmethod
    def valid_questions(cls, value):
        if any(
            set(pair) - {"question", "answer"}
            or "question" not in pair
            or any(len(text) > 10_000 for text in pair.values())
            for pair in value
        ):
            raise ValueError("Invalid question and answer pairs")
        return value


class SourceUpdate(Revision):
    text: str = Field(max_length=100_000)


class DeleteAccount(Input):
    current_password: str = Field(max_length=64)
    confirm: bool
