"""Pydantic schemas for UserProfile model.

These schemas handle request/response validation for the user profile API endpoints.
"""

from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class ProfileFields(BaseModel):
    display_name: str | None = Field(None, max_length=255)
    desired_positions: list[str] = Field(default_factory=list, max_length=100)
    fields_of_work: list[str] = Field(default_factory=list, max_length=100)
    seniority: str | None = Field(None, max_length=50)
    work_modes: list[str] = Field(default_factory=list, max_length=10)
    employment_types: list[str] = Field(default_factory=list, max_length=10)
    years_experience: float | None = Field(None, ge=0, le=100)
    location_restrictions: str | None = Field(None, max_length=2000)
    skill_items: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    technologies: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    projects: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    certificates: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    languages: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    ai_permissions: dict[str, bool] = Field(default_factory=dict)

    @field_validator(
        "desired_positions", "fields_of_work", "work_modes", "employment_types"
    )
    @classmethod
    def bounded_labels(cls, value):
        if any(not text.strip() or len(text) > 255 for text in value):
            raise ValueError("Labels must have 1–255 characters")
        return value

    @field_validator(
        "skill_items",
        "technologies",
        "projects",
        "certificates",
        "languages",
        "ai_permissions",
    )
    @classmethod
    def bounded_items(cls, value):
        import json

        if len(json.dumps(value)) > 100_000:
            raise ValueError("Profile section exceeds 100000 characters")
        return value


class UserProfileUpdate(ProfileFields):
    expected_revision: int | None = Field(None, ge=0)

    @model_validator(mode="after")
    def typed_items(self):
        import json

        from app.schemas.profile_items import ENTRY_SCHEMAS, validate_entries

        for field in self.model_fields_set & ENTRY_SCHEMAS.keys():
            value = getattr(self, field)
            if len(json.dumps(value)) > 100_000:
                raise ValueError("Profile section exceeds 100000 characters")
            setattr(self, field, validate_entries(field, value))
        return self

    """Update supplied profile fields; ownership comes from authentication."""

    # Personal info
    first_name: str | None = Field(None, max_length=100, description="First name")
    last_name: str | None = Field(None, max_length=100, description="Last name")
    email: EmailStr | None = Field(None, description="Email address")
    phone: str | None = Field(None, max_length=50, description="Phone number")
    location: str | None = Field(
        None, max_length=255, description="Location (city, state/country)"
    )
    linkedin_url: str | None = Field(
        None, max_length=512, description="LinkedIn profile URL"
    )

    # User-level location fields
    city: str | None = Field(None, max_length=100, description="City")
    country: str | None = Field(None, max_length=100, description="Country")

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
        max_length=200,
    )
    education: list[dict[str, Any]] | None = Field(
        None,
        description="List of education entries",
        max_length=200,
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
        cleaned = (
            v.replace(" ", "")
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


class UserProfileResponse(ProfileFields):
    revision: int = 0
    permission_revision: int = 0
    model_config = ConfigDict(from_attributes=True)

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

    # User-level location fields
    city: str | None = None
    country: str | None = None

    # Work authorization
    authorized_to_work: str | None
    requires_sponsorship: bool | None

    # Extended profile (JSON)
    work_history: list[dict[str, Any]] | None
    education: list[dict[str, Any]] | None
    skills: list[str] | None
