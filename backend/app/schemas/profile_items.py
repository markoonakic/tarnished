"""Typed known profile fields; unknown legacy keys remain editable data."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Entry(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: UUID | None = None


class SkillEntry(Entry):
    name: str | None = Field(None, max_length=255)


class WorkEntry(Entry):
    title: str | None = Field(None, max_length=255)
    company: str | None = Field(None, max_length=255)
    start_date: str | None = Field(None, max_length=30)
    end_date: str | None = Field(None, max_length=30)
    current: bool | None = None
    description: str | None = Field(None, max_length=20_000)


class LinkedEntry(Entry):
    link: str | None = Field(None, max_length=2048)

    @field_validator("link")
    @classmethod
    def safe_link(cls, value):
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("Use an HTTP(S) link")
        return value


class ProjectEntry(LinkedEntry):
    name: str | None = Field(None, max_length=255)
    kind: Literal["personal", "professional"] | None = None
    description: str | None = Field(None, max_length=20_000)
    technologies: list[str] = Field(default_factory=list, max_length=100)
    link: str | None = Field(None, max_length=2048)


class EducationEntry(Entry):
    institution: str | None = Field(None, max_length=255)
    degree: str | None = Field(None, max_length=255)
    field: str | None = Field(None, max_length=255)
    start_date: str | None = Field(None, max_length=30)
    end_date: str | None = Field(None, max_length=30)


class CertificateEntry(LinkedEntry):
    name: str | None = Field(None, max_length=255)
    issuer: str | None = Field(None, max_length=255)
    date: str | None = Field(None, max_length=30)
    link: str | None = Field(None, max_length=2048)


class LanguageEntry(Entry):
    name: str | None = Field(None, max_length=100)
    language: str | None = Field(None, max_length=100)
    level: Literal["A1", "A2", "B1", "B2", "C1", "C2", "Native", "native"] | None = None


ENTRY_SCHEMAS = {
    "work_history": WorkEntry,
    "education": EducationEntry,
    "projects": ProjectEntry,
    "certificates": CertificateEntry,
    "languages": LanguageEntry,
    "skill_items": SkillEntry,
    "technologies": SkillEntry,
}


def validate_entries(field, value):
    if value is None:
        return value
    schema = ENTRY_SCHEMAS[field]
    return [
        item
        if item.get("needs_repair")
        else schema.model_validate(item).model_dump(mode="json", exclude_unset=True)
        for item in value
    ]
