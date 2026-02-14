"""Pydantic schemas for JobLead model.

These schemas handle request/response validation for the job leads API endpoints
and structured extraction with LiteLLM.
"""

from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator


# Job Lead Status Enum (as Literal for type safety)
JobLeadStatus = Annotated[str, Field(pattern="^(pending|extracted|failed)$")]


class JobLeadCreate(BaseModel):
    """Request schema for creating a new job lead.

    Users submit a URL and optional HTML content for extraction.
    """

    url: str = Field(
        ...,
        min_length=1,
        max_length=2048,
        description="The URL of the job posting",
    )
    html: str | None = Field(
        None,
        description="Optional pre-fetched HTML content of the job posting",
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        """Ensure URL starts with http:// or https://."""
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class JobLeadResponse(BaseModel):
    """Full response schema for a job lead.

    Includes all fields from the JobLead model.
    """

    id: str
    user_id: str
    status: str

    # Core job info
    title: str | None
    company: str | None
    url: str

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

    class Config:
        from_attributes = True


class JobLeadListItem(BaseModel):
    """Simplified job lead schema for list views.

    Contains essential fields for listing without full details.
    """

    id: str
    status: str
    title: str | None
    company: str | None
    url: str
    location: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    source: str | None
    scraped_at: datetime
    converted_to_application_id: str | None
    error_message: str | None

    class Config:
        from_attributes = True


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
        ge=0,
        description="Minimum salary in the posted range",
    )
    salary_max: int | None = Field(
        None,
        ge=0,
        description="Maximum salary in the posted range",
    )
    salary_currency: str | None = Field(
        None,
        max_length=10,
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
        max_length=512,
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
        ge=0,
        description="Minimum years of experience required",
    )
    years_experience_max: int | None = Field(
        None,
        ge=0,
        description="Maximum years of experience (for senior roles)",
    )
    source: str | None = Field(
        None,
        max_length=100,
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
