"""Pydantic schemas for UserProfile model.

These schemas handle request/response validation for the user profile API endpoints.
"""

from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator


class WorkHistoryItem(BaseModel):
    """Schema for a single work history entry.

    This is a flexible schema that allows various work history formats.
    """

    company: str | None = Field(None, description="Company name")
    title: str | None = Field(None, description="Job title")
    start_date: str | None = Field(None, description="Start date of employment")
    end_date: str | None = Field(None, description="End date of employment (or 'Present')")
    description: str | None = Field(None, description="Job description or accomplishments")
    location: str | None = Field(None, description="Work location")


class EducationItem(BaseModel):
    """Schema for a single education entry.

    This is a flexible schema that allows various education formats.
    """

    institution: str | None = Field(None, description="School or institution name")
    degree: str | None = Field(None, description="Degree type (e.g., 'Bachelor of Science')")
    field_of_study: str | None = Field(None, description="Field of study or major")
    start_date: str | None = Field(None, description="Start date")
    end_date: str | None = Field(None, description="End date or expected graduation")
    gpa: str | None = Field(None, description="GPA if applicable")


class UserProfileBase(BaseModel):
    """Base schema with shared UserProfile fields."""

    # Personal info
    first_name: str | None = Field(None, max_length=100, description="First name")
    last_name: str | None = Field(None, max_length=100, description="Last name")
    email: EmailStr | None = Field(None, description="Email address")
    phone: str | None = Field(None, max_length=50, description="Phone number")
    location: str | None = Field(None, max_length=255, description="Location (city, state/country)")
    linkedin_url: str | None = Field(None, max_length=512, description="LinkedIn profile URL")

    # Work authorization
    authorized_to_work: str | None = Field(
        None,
        max_length=100,
        description="Work authorization status (e.g., 'US Citizen', 'Green Card Holder')",
    )
    requires_sponsorship: bool | None = Field(
        None,
        description="Whether the candidate requires visa sponsorship",
    )

    # Extended profile (JSON)
    work_history: list[dict[str, Any]] | None = Field(
        None,
        description="List of work history entries",
    )
    education: list[dict[str, Any]] | None = Field(
        None,
        description="List of education entries",
    )
    skills: list[str] | None = Field(
        None,
        description="List of skills",
    )

    @field_validator("linkedin_url")
    @classmethod
    def validate_linkedin_url(cls, v: str | None) -> str | None:
        """Ensure LinkedIn URL is valid if provided."""
        if v is None:
            return v
        if not v.startswith(("http://", "https://")):
            raise ValueError("LinkedIn URL must start with http:// or https://")
        if "linkedin.com" not in v.lower():
            raise ValueError("URL must be a valid LinkedIn URL")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        """Basic phone number validation."""
        if v is None:
            return v
        # Remove common formatting characters and check if remaining chars are valid
        cleaned = v.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace("+", "")
        if not cleaned.isdigit():
            raise ValueError("Phone number must contain only digits, spaces, hyphens, parentheses, and +")
        if len(cleaned) < 7:
            raise ValueError("Phone number is too short")
        if len(cleaned) > 15:
            raise ValueError("Phone number is too long")
        return v

    @field_validator("skills", mode="before")
    @classmethod
    def validate_skills(cls, v: list[str] | None) -> list[str] | None:
        """Ensure skills is a list of non-empty strings."""
        if v is None:
            return v
        if not isinstance(v, list):
            raise ValueError("Skills must be a list")
        # Filter out empty strings and ensure all items are strings
        validated = []
        for skill in v:
            if isinstance(skill, str):
                trimmed = skill.strip()
                if trimmed:
                    validated.append(trimmed)
            else:
                raise ValueError("All skills must be strings")
        return validated if validated else None


class UserProfileUpdate(UserProfileBase):
    """Schema for updating a user profile via PUT /api/profile.

    All fields are optional to support partial updates.
    The user_id is inferred from the authenticated user.
    """

    pass


class UserProfileCreate(UserProfileBase):
    """Schema for creating a new user profile.

    This is typically used internally when creating a profile for a new user.
    The user_id must be provided explicitly.
    """

    user_id: str = Field(..., description="ID of the user this profile belongs to")


class UserProfileResponse(BaseModel):
    """Full response schema for a user profile.

    Includes all fields from the UserProfile model.
    """

    id: str
    user_id: str

    # Personal info
    first_name: str | None
    last_name: str | None
    email: str | None
    phone: str | None
    location: str | None
    linkedin_url: str | None

    # Work authorization
    authorized_to_work: str | None
    requires_sponsorship: bool | None

    # Extended profile (JSON)
    work_history: list[dict[str, Any]] | None
    education: list[dict[str, Any]] | None
    skills: list[str] | None

    class Config:
        from_attributes = True
