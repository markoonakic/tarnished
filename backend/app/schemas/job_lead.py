"""Pydantic schemas for JobLead model.

These schemas handle request/response validation for the job leads API endpoints
and structured extraction with LiteLLM.
"""

import ipaddress
from datetime import date, datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.schemas.workspace import JobFields, JobFieldsResponse


class JobLeadCreate(JobFields):
    title: str | None = Field(None, max_length=255)
    company: str | None = Field(None, max_length=255)
    location: str | None = Field(None, max_length=255)

    @model_validator(mode="after")
    def manual_requires_title(self):
        if not (
            self.url or self.text or self.html or (self.title and self.title.strip())
        ):
            raise ValueError("A manual lead requires a title")
        return self

    """Request schema for creating a new job lead.

    Save never fetches or calls AI. Optional text/HTML becomes a bounded
    untrusted source snapshot; enrichment is a separate explicit request.
    Prefer plain page text; HTML is preprocessed locally, not sanitized.
    """

    url: str | None = Field(
        None,
        min_length=1,
        max_length=2048,
        description="The URL of the job posting",
    )
    text: str | None = Field(
        None,
        max_length=100_000,
        description="Plain text content from the job posting page (preferred, max 100,000 characters)",
    )
    html: str | None = Field(
        None,
        max_length=500_000,
        description="Optional pre-fetched HTML content (legacy, max 500,000 characters)",
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        """Ensure URL starts with http:// or https://."""
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    @field_validator("url")
    @classmethod
    def validate_url_not_internal(cls, v: str) -> str:
        """Block SSRF attempts by rejecting internal/private IP addresses."""
        if not v:
            return v

        parsed = urlparse(v)
        hostname = parsed.hostname

        if not hostname:
            raise ValueError("Invalid URL format")

        # Block localhost variants
        blocked_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}  # nosec B104 # Security: blocking these hosts
        if hostname.lower() in blocked_hosts:
            raise ValueError("Cannot access internal resources")

        # Block private IP ranges and special addresses
        try:
            ip = ipaddress.ip_address(hostname)
        except ValueError:
            # Not an IP address, likely a domain name - allowed
            return v

        # If we reach here, it's a valid IP - check if it's internal
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("Cannot access internal IP addresses")

        return v


class JobLeadResponse(JobFieldsResponse):
    pending_analysis_id: str | None = None
    decision: Literal["interesting", "rejected", "archived"] | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def error_code(self) -> str | None:
        return "AI_EXTRACTION_FAILED" if self.error_message else None

    @computed_field
    @property
    def content_warning_code(self) -> str | None:
        if not self.content_warning:
            return None
        if self.source_truncated:
            return "source_incomplete"
        return "source_normalized" if self.source_text else "source_missing"

    """Full response schema for a job lead.

    Includes all fields from the JobLead model.
    """

    id: str
    user_id: str
    status: str

    source_text: str | None
    source_truncated: bool
    content_warning: str | None
    revision: int
    processing_started_at: datetime | None
    manual_fields: list[str]

    @field_validator("processing_started_at")
    @classmethod
    def utc_processing_time(cls, value):
        from datetime import UTC

        return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value

    # Core job info
    title: str | None
    company: str | None
    url: str | None

    # Rich extraction
    description: str | None
    location: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None

    # People intelligence
    recruiter_name: str | None
    recruiter_title: str | None
    recruiter_linkedin_url: str | None

    # Requirements
    requirements_must_have: list[str]
    requirements_nice_to_have: list[str]
    skills: list[str]
    years_experience_min: int | None
    years_experience_max: int | None

    # Metadata
    source: str | None
    posted_date: date | None
    scraped_at: datetime

    # Status
    converted_to_application_id: str | None
    error_message: str | None


class JobLeadListItem(JobFieldsResponse):
    decision: Literal["interesting", "rejected", "archived"] | None = None
    revision: int = 0
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

    """Simplified job lead schema for list views.

    Contains essential fields for listing without full details.
    """

    id: str
    status: str
    title: str | None
    company: str | None
    url: str | None
    location: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    source: str | None
    scraped_at: datetime
    converted_to_application_id: str | None
    error_message: str | None


class JobLeadListResponse(BaseModel):
    """Paginated list response for job leads."""

    items: list[JobLeadListItem]
    total: int
    page: int
    per_page: int


class JobLeadExtractionInput(BaseModel):
    """Schema for LiteLLM structured extraction of job posting data.

    This schema defines the expected output structure when extracting
    job information from HTML content using AI.
    """

    title: str | None = Field(
        None,
        description="The job title (e.g., 'Senior Software Engineer')",
    )
    company: str | None = Field(
        None,
        description="The company name posting the job",
    )
    description: str | None = Field(
        None,
        description="Full job description in markdown format",
    )
    location: str | None = Field(
        None,
        description="Job location (e.g., 'San Francisco, CA' or 'Remote')",
    )
    salary_min: int | None = Field(
        None,
        description="Minimum salary in the posted range",
    )
    salary_max: int | None = Field(
        None,
        description="Maximum salary in the posted range",
    )
    salary_currency: str | None = Field(
        None,
        description="Currency code (e.g., 'USD', 'EUR')",
    )
    recruiter_name: str | None = Field(
        None,
        description="Name of the recruiter or hiring manager if mentioned",
    )
    recruiter_title: str | None = Field(
        None,
        description="Title of the recruiter (e.g., 'Technical Recruiter')",
    )
    recruiter_linkedin_url: str | None = Field(
        None,
        description="LinkedIn URL of the recruiter if available",
    )
    requirements_must_have: list[str] = Field(
        default_factory=list,
        description="List of must-have requirements/qualifications",
    )
    requirements_nice_to_have: list[str] = Field(
        default_factory=list,
        description="List of nice-to-have requirements/qualifications",
    )
    skills: list[str] = Field(
        default_factory=list,
        description="List of technical or soft skills required",
    )
    years_experience_min: int | None = Field(
        None,
        description="Minimum years of experience required",
    )
    years_experience_max: int | None = Field(
        None,
        description="Maximum years of experience (for senior roles)",
    )
    source: str | None = Field(
        None,
        description="Source platform (e.g., 'LinkedIn', 'Indeed', 'Company Website')",
    )
    posted_date: date | None = Field(
        None,
        description="Date the job was posted",
    )

    @field_validator("salary_max")
    @classmethod
    def validate_salary_range(cls, v: int | None, info) -> int | None:
        """Ensure salary_max is >= salary_min if both are provided."""
        salary_min = info.data.get("salary_min")
        if v is not None and salary_min is not None and v < salary_min:
            raise ValueError("salary_max must be greater than or equal to salary_min")
        return v

    @field_validator("years_experience_max")
    @classmethod
    def validate_experience_range(cls, v: int | None, info) -> int | None:
        """Ensure years_experience_max is >= years_experience_min if both are provided."""
        years_min = info.data.get("years_experience_min")
        if v is not None and years_min is not None and v < years_min:
            raise ValueError(
                "years_experience_max must be greater than or equal to years_experience_min"
            )
        return v


class JobLeadEditable(JobLeadExtractionInput, JobFields):
    url: str | None = Field(None, max_length=2048)

    @field_validator("url")
    @classmethod
    def safe_url(cls, value):
        JobLeadCreate.validate_url(value)
        return JobLeadCreate.validate_url_not_internal(value)

    decision: Literal["interesting", "rejected", "archived"] | None = None
    """Business-field allowlist; null clears scalar fields, [] clears lists."""

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def bounded_fields(self):
        limits = {
            "description": 50_000,
            "url": 2048,
            "salary_currency": 10,
            "recruiter_linkedin_url": 512,
            "source": 100,
        }
        for name, value in self.model_dump().items():
            if isinstance(value, str) and "\x00" in value:
                raise ValueError(f"{name} must not contain NUL characters")
            if isinstance(value, str) and len(value) > limits.get(name, 255):
                raise ValueError(f"{name} exceeds {limits.get(name, 255)} characters")
            if isinstance(value, list) and (
                len(value) > 200 or any(len(item) > 2000 for item in value)
            ):
                raise ValueError(
                    f"{name} exceeds 200 entries or 2000 characters per entry"
                )
            if isinstance(value, int) and not 0 <= value <= 2_147_483_647:
                raise ValueError(f"{name} must be a nonnegative 32-bit integer")
        return self


class JobLeadUpdate(JobLeadEditable):
    expected_revision: int = Field(ge=0)


class JobLeadExtractRequest(BaseModel):
    language: Literal["en", "sr-Latn"] | None = None
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    restart_processing: bool = Field(
        False,
        description=(
            "Explicitly replace an interrupted/uncertain request. The previous provider "
            "call may still finish or have been billed; restarting may repeat paid work. "
            "Execution is request-bound, not a durable background job."
        ),
    )


class JobLeadCaptureArchive(BaseModel):
    """Optional additions to existing archives; no executable processing claim."""

    source_text: str | None = Field(None, max_length=100_000)
    source_truncated: bool = False
    content_warning: str | None = Field(None, max_length=2000)
    revision: int = Field(0, ge=0)
    manual_fields: list[str] = Field(default_factory=list)

    @field_validator("manual_fields")
    @classmethod
    def editable_only(cls, value):
        if not set(value) <= JobLeadEditable.model_fields.keys():
            raise ValueError("manual_fields contains a non-editable field")
        return sorted(set(value))
