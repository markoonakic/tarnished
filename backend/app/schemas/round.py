from datetime import datetime

from pydantic import BaseModel


class RoundTypeResponse(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True


class RoundMediaResponse(BaseModel):
    id: str
    file_path: str
    original_filename: str | None = None
    media_type: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


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
    id: str
    round_type: RoundTypeResponse
    scheduled_at: datetime | None
    completed_at: datetime | None
    outcome: str | None
    notes_summary: str | None
    transcript_path: str | None
    transcript_summary: str | None
    media: list[RoundMediaResponse]
    created_at: datetime

    class Config:
        from_attributes = True
