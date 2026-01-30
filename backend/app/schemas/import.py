from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


class CustomStatusSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    is_default: bool = False
    order: Optional[int] = None


class CustomRoundTypeSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    is_default: bool = False


class RoundMediaSchema(BaseModel):
    type: str = Field(..., min_length=1)
    path: Optional[str] = None


class RoundSchema(BaseModel):
    id: Optional[str] = None  # Old ID, not used during import
    type: str = Field(..., min_length=1)
    scheduled_at: Optional[str] = None
    completed_at: Optional[str] = None
    outcome: Optional[str] = None
    notes_summary: Optional[str] = None
    media: List[RoundMediaSchema] = []


class StatusHistoryEntrySchema(BaseModel):
    from_status: Optional[str] = None
    to_status: str = Field(..., min_length=1)
    changed_at: str = Field(..., min_length=1)
    note: Optional[str] = None


class ApplicationSchema(BaseModel):
    id: Optional[str] = None  # Old ID, not used during import
    company: str = Field(..., min_length=1, max_length=200)
    job_title: str = Field(..., min_length=1, max_length=200)
    job_description: Optional[str] = None
    job_url: Optional[str] = None
    status: str = Field(..., min_length=1)
    cv_path: Optional[str] = None
    applied_at: str = Field(..., min_length=1)
    status_history: List[StatusHistoryEntrySchema] = []
    rounds: List[RoundSchema] = []

    @field_validator('job_url')
    @classmethod
    def validate_url(cls, v):
        if v and not v.startswith(('http://', 'https://')):
            raise ValueError('job_url must start with http:// or https://')
        return v


class UserSchema(BaseModel):
    id: Optional[str] = None
    email: str = Field(..., min_length=5)


class ImportDataSchema(BaseModel):
    user: UserSchema
    custom_statuses: List[CustomStatusSchema] = []
    custom_round_types: List[CustomRoundTypeSchema] = []
    applications: List[ApplicationSchema] = []

    @field_validator('applications')
    @classmethod
    def validate_applications_count(cls, v):
        if len(v) > 1000:
            raise ValueError('Cannot import more than 1000 applications at once')
        return v
