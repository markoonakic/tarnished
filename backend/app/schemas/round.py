from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RoundTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class RoundMediaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_path: str
    original_filename: str | None = None
    media_type: str
    uploaded_at: datetime


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


class RoundResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    round_type: RoundTypeResponse
    scheduled_at: datetime | None
    completed_at: datetime | None
    outcome: str | None
    notes_summary: str | None
    transcript_path: str | None
    transcript_original_filename: str | None = None
    transcript_summary: str | None
    media: list[RoundMediaResponse]
    created_at: datetime
