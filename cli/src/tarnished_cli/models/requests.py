from __future__ import annotations

import ipaddress
from datetime import date, datetime
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, EmailStr, Field, field_validator


class ApplicationExtractRequest(BaseModel):
    url: str
    status_id: str
    applied_at: date | None = None
    text: str | None = None


class ApplicationCreate(BaseModel):
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


class StatusCreate(BaseModel):
    name: str
    color: str = "#83a598"


class StatusUpdate(BaseModel):
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


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    password: str | None = None


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    is_admin: bool = False
    is_active: bool = True


class AdminStatusUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    order: int | None = None


class AdminRoundTypeUpdate(BaseModel):
    name: str | None = None


class AISettingsUpdate(BaseModel):
    litellm_model: str | None = None
    litellm_api_key: str | None = None
    litellm_base_url: str | None = None

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
    period: str
