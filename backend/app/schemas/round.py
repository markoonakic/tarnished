from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RoundTypeResponse(BaseModel):
    builtin_key: str | None = None
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class RoundMediaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_path: str
    original_filename: str | None = None
    media_type: str
    sha256: str | None = None
    byte_count: int | None = None
    probed_duration_seconds: float | None = None
    validation: str | None = None
    uploaded_at: datetime


class RoundCreate(BaseModel):
    round_type_id: str = Field(min_length=1, max_length=36)
    scheduled_at: datetime | None = None
    notes_summary: str | None = None
    transcript_summary: str | None = None


class RoundUpdate(BaseModel):
    round_type_id: str | None = Field(None, min_length=1, max_length=36)
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    outcome: str | None = None
    notes_summary: str | None = None
    transcript_summary: str | None = None

    @field_validator("round_type_id")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        return value


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
    media_generation: int = 0
    transcript_generation: int = 0
    has_current_transcript: bool = False
    media: list[RoundMediaResponse]
    created_at: datetime

    @field_validator("scheduled_at", "completed_at")
    @classmethod
    def round_dates_are_utc(cls, value: datetime | None) -> datetime | None:
        # SQLite drops timezone metadata from UTC-normalized round writes.
        return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value
