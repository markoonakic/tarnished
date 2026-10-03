from __future__ import annotations

import ipaddress
from datetime import date, datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

Meaning = Literal[
    "unknown",
    "applied",
    "screening",
    "interviewing",
    "offer",
    "accepted",
    "rejected",
    "withdrawn",
    "no_reply",
]


class ResponseEvidenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    occurred_on: date | None = None
    reference: str | None = Field(None, max_length=2000)


class ApplicationExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    response_evidence: ResponseEvidenceInput | None = None
    url: str
    status_id: str
    applied_at: date | None = None
    text: str | None = None


class ApplicationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    response_evidence: ResponseEvidenceInput | None = None
    company: str
    job_title: str
    job_description: str | None = None
    job_url: str | None = None
    status_id: str
    applied_at: date | None = None
    job_lead_id: str | None = None
    description: str | None = None
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


class ApplicationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int | None = Field(None, ge=0)
    response_evidence: ResponseEvidenceInput | None = None
    company: str | None = None
    job_title: str | None = None
    job_description: str | None = None
    job_url: str | None = None
    status_id: str | None = None
    applied_at: date | None = None
    description: str | None = None
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


class JobLeadCreate(BaseModel):
    """Save only: text/HTML limits are characters; retained source is at most 50,000."""

    model_config = ConfigDict(extra="forbid")
    url: str = Field(..., min_length=1, max_length=2048)
    text: str | None = Field(None, max_length=100_000)
    html: str | None = Field(None, max_length=500_000)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        if value and not value.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return value

    @field_validator("url")
    @classmethod
    def validate_url_not_internal(cls, value: str) -> str:
        if not value:
            return value

        parsed = urlparse(value)
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("Invalid URL format")

        blocked_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
        if hostname.lower() in blocked_hosts:
            raise ValueError("Cannot access internal resources")

        try:
            ip = ipaddress.ip_address(hostname)
        except ValueError:
            return value

        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("Cannot access internal IP addresses")

        return value


class JobLeadUpdate(BaseModel):
    """Omit unchanged fields; null clears scalars and [] clears lists.

    The server validates merged ranges and protects supplied fields from AI.
    URL, source snapshot, conversion links and internal state are not editable.
    """

    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    title: str | None = None
    company: str | None = None
    description: str | None = None
    location: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str | None = None
    recruiter_name: str | None = None
    recruiter_title: str | None = None
    recruiter_linkedin_url: str | None = None
    requirements_must_have: list[str] = Field(default_factory=list)
    requirements_nice_to_have: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    years_experience_min: int | None = None
    years_experience_max: int | None = None
    source: str | None = None
    posted_date: date | None = None

    @model_validator(mode="after")
    def validate_edit(self):
        if not self.model_fields_set - {"expected_revision"}:
            raise ValueError("Supply at least one editable field")
        limits = {
            "description": 50_000,
            "salary_currency": 10,
            "recruiter_linkedin_url": 512,
            "source": 100,
        }
        for name, value in self.model_dump(exclude={"expected_revision"}).items():
            if isinstance(value, str) and (
                "\x00" in value or len(value) > limits.get(name, 255)
            ):
                raise ValueError(
                    f"{name} must not contain NUL and allows up to {limits.get(name, 255)} characters"
                )
            if isinstance(value, list) and (
                len(value) > 200 or any(len(item) > 2000 for item in value)
            ):
                raise ValueError(f"{name} allows up to 200 entries of 2,000 characters")
            if isinstance(value, int) and not 0 <= value <= 2_147_483_647:
                raise ValueError(f"{name} must be a nonnegative 32-bit integer")
        for lower, upper in [
            (self.salary_min, self.salary_max),
            (self.years_experience_min, self.years_experience_max),
        ]:
            if lower is not None and upper is not None and lower > upper:
                raise ValueError("Maximum must be greater than or equal to minimum")
        return self


class JobLeadExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    restart_processing: bool = False


class StatusCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    meaning: Meaning = "unknown"
    name: str
    color: str = "#83a598"


class StatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    meaning: Meaning | None = None
    name: str | None = None
    color: str | None = None


class RoundTypeCreate(BaseModel):
    name: str


class UserSettingsUpdate(BaseModel):
    theme: str | None = None
    accent: str | None = None


class RoundCreate(BaseModel):
    round_type_id: str
    scheduled_at: datetime | None = None
    notes_summary: str | None = None
    transcript_summary: str | None = None


class RoundUpdate(BaseModel):
    round_type_id: str | None = None
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    outcome: str | None = None
    notes_summary: str | None = None
    transcript_summary: str | None = None


class TranscriptSegmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=36)
    text: str = Field(max_length=64000)
    speaker: str | None = Field(default=None, max_length=64)
    start: float | None = Field(default=None, ge=0, le=7200)
    end: float | None = Field(default=None, ge=0, le=7200)
    audio_channel: str | None = Field(default=None, max_length=120)


class TranscriptPaste(BaseModel):
    """Replace the round transcript from pasted TXT/SRT/VTT text."""

    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1)
    format: Literal["txt", "srt", "vtt"] = "txt"


class TranscriptEdit(BaseModel):
    """Correct existing segments; IDs, order and source timestamps must be kept."""

    model_config = ConfigDict(extra="forbid")
    segments: list[TranscriptSegmentInput]


def validate_new_password(password: str) -> str:
    if not password:
        raise ValueError("Password must not be empty")
    if len(password) > 64:
        raise ValueError("Use at most 64 characters.")
    try:
        password.encode("utf-8")
    except UnicodeError:
        raise ValueError("Password cannot be encoded as UTF-8") from None
    return password


NewPassword = Annotated[str, AfterValidator(validate_new_password)]


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)
    is_active: bool | None = None
    is_admin: bool | None = None
    password: NewPassword | None = None

    @field_validator("password", "is_active", "is_admin")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        return value


class AdminUserCreate(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)
    email: EmailStr
    password: NewPassword
    is_admin: bool = False
    is_active: bool = True


class AdminStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    meaning: Meaning | None = None
    name: str | None = None
    color: str | None = None
    order: int | None = None


class AdminRoundTypeUpdate(BaseModel):
    name: str | None = None


class AISettingsUpdate(BaseModel):
    litellm_model: str | None = None
    litellm_api_key: str | None = None
    litellm_base_url: str | None = None
    text_protocol: Literal["chat_completions", "responses"] | None = None

    @field_validator("litellm_model")
    @classmethod
    def validate_model(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Model name cannot be empty")
        return value

    @field_validator("litellm_api_key")
    @classmethod
    def validate_api_key(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("API key cannot be empty")
        return value

    @field_validator("litellm_base_url")
    @classmethod
    def validate_base_url(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Base URL cannot be empty")
        return value


class UserProfileUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    location: str | None = Field(None, max_length=255)
    linkedin_url: str | None = Field(None, max_length=512)
    city: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=100)
    authorized_to_work: str | None = Field(None, max_length=100)
    requires_sponsorship: bool | None = None
    work_history: list[dict[str, Any]] | None = None
    education: list[dict[str, Any]] | None = None
    skills: list[str] | None = None

    @field_validator("linkedin_url")
    @classmethod
    def validate_linkedin_url(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.startswith(("http://", "https://")):
            raise ValueError("LinkedIn URL must start with http:// or https://")
        if "linkedin.com" not in value.lower():
            raise ValueError("URL must be a valid LinkedIn URL")
        return value

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = (
            value.replace(" ", "")
            .replace("-", "")
            .replace("(", "")
            .replace(")", "")
            .replace("+", "")
        )
        if not cleaned.isdigit():
            raise ValueError(
                "Phone number must contain only digits, spaces, hyphens, parentheses, and +"
            )
        if len(cleaned) < 7:
            raise ValueError("Phone number is too short")
        if len(cleaned) > 15:
            raise ValueError("Phone number is too long")
        return value

    @field_validator("skills", mode="before")
    @classmethod
    def validate_skills(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        if not isinstance(value, list):
            raise ValueError("Skills must be a list")
        validated: list[str] = []
        for skill in value:
            if not isinstance(skill, str):
                raise ValueError("All skills must be strings")
            trimmed = skill.strip()
            if trimmed:
                validated.append(trimmed)
        return validated if validated else None


class InsightsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: str
    as_of: AwareDatetime | None = None


class ScopedReportRequest(BaseModel):
    """Request interview or application feedback at a known generation."""

    model_config = ConfigDict(extra="forbid")
    intent_id: str
    generation: int = Field(ge=0)
    config_revision: str = Field(min_length=1, max_length=36)


class PipelineReportRequest(BaseModel):
    """Request the latest pipeline-scope grounded feedback."""

    model_config = ConfigDict(extra="forbid")
    intent_id: str
    config_revision: str = Field(min_length=1, max_length=36)
    period: Literal["7d", "30d", "3m", "all"] = "30d"
    as_of: AwareDatetime | None = None


class DocumentTextPaste(BaseModel):
    """Replace the current pasted CV/cover-letter text for analysis."""

    model_config = ConfigDict(extra="forbid")
    text: str = Field(max_length=32000)
    expected_revision: int = Field(ge=0)


class CurrentMeaningCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    meaning: Meaning
    expected_revision: int = Field(ge=0)


class HistoryCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    from_meaning: Meaning | None = None
    to_meaning: Meaning | None = None
    changed_at: AwareDatetime | None = None
    correction_note: str | None = Field(None, max_length=2000)

    @field_validator("from_meaning", "to_meaning", "changed_at")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        return value
