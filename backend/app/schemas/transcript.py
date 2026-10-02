"""Bounded current transcript content; timestamps are source evidence, not estimates."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_TRANSCRIPT_BYTES = 2_000_000
MAX_SEGMENTS = 10_000


class TranscriptModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TranscriptSegment(TranscriptModel):
    id: str
    text: str = Field(min_length=1, max_length=64_000)
    start: float | None = Field(default=None, ge=0, le=7200, allow_inf_nan=False)
    end: float | None = Field(default=None, ge=0, le=7200, allow_inf_nan=False)
    speaker: str | None = Field(default=None, min_length=1, max_length=100)
    role: Literal["unknown", "candidate", "interviewer", "other"] = "unknown"
    audio_channel: str | None = Field(
        default=None, pattern=r"^track [1-8], channel [1-8]$"
    )

    @field_validator("id")
    @classmethod
    def valid_id(cls, value: str) -> str:
        UUID(value)
        return value

    @field_validator("text", "speaker")
    @classmethod
    def safe_text(cls, value: str | None) -> str | None:
        if value is not None:
            if not value.strip() or "\x00" in value:
                raise ValueError("Transcript text must be nonempty and contain no NUL")
            value.encode("utf-8")
        return value

    @model_validator(mode="after")
    def time_pair(self):
        if (self.start is None) != (self.end is None):
            raise ValueError("Both timestamps must be supplied or unknown")
        if self.start is not None and self.end is not None and self.end <= self.start:
            raise ValueError("Segment end must follow start")
        return self


Segments = Annotated[
    list[TranscriptSegment], Field(min_length=1, max_length=MAX_SEGMENTS)
]


class TranscriptEdit(TranscriptModel):
    segments: Segments

    @model_validator(mode="after")
    def ordered_bounded_segments(self):
        if len({segment.id for segment in self.segments}) != len(self.segments):
            raise ValueError("Segment IDs must be unique")
        previous = -1.0
        size = 0
        for segment in self.segments:
            size += len(segment.text.encode("utf-8"))
            size += len((segment.speaker or "").encode("utf-8"))
            if segment.start is not None:
                if segment.start < previous:
                    raise ValueError("Timed segments must be ordered by start")
                previous = segment.start
        if size > MAX_TRANSCRIPT_BYTES:
            raise ValueError("Transcript text exceeds 2,000,000 UTF-8 bytes")
        return self


class AudioChunk(TranscriptModel):
    track: int = Field(ge=0, le=7)
    channel: int = Field(ge=0, le=7)
    index: int = Field(ge=0, le=12)
    start: float = Field(ge=0, le=7200, allow_inf_nan=False)
    end: float = Field(gt=0, le=7200, allow_inf_nan=False)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class CurrentTranscript(TranscriptEdit):
    id: str
    revision: int = Field(ge=1)
    provenance: Literal["paste", "upload", "media"]
    format: Literal["txt", "srt", "vtt", "json"]
    language: Literal["en"] = "en"
    coverage: Literal["provided_text", "complete_audio", "imported_audio"] = (
        "provided_text"
    )
    source_media_id: str | None = None
    source_hash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    provider: str | None = Field(
        default=None, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$"
    )
    model: str | None = Field(
        default=None, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$"
    )
    structure: Literal["none", "automatic"] = "none"
    structure_model: str | None = Field(
        default=None, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$"
    )
    structure_status: Literal["Automatic sections unavailable"] | None = None
    config_revision: str | None = Field(default=None, max_length=36)
    audio_coverage: list[AudioChunk] = Field(default_factory=list, max_length=832)

    @model_validator(mode="after")
    def media_provenance(self):
        if self.provenance == "media":
            UUID(self.source_media_id or "")
            if (
                not self.source_hash
                or not self.provider
                or not self.model
                or not self.config_revision
                or self.format != "json"
                or self.coverage == "provided_text"
                or not self.audio_coverage
            ):
                raise ValueError("Incomplete recording transcript provenance")
            cursors = {}
            for chunk in self.audio_coverage:
                key = (chunk.track, chunk.channel)
                index, end = cursors.get(key, (0, 0.0))
                if (
                    chunk.index != index
                    or chunk.start != end
                    or chunk.end <= chunk.start
                ):
                    raise ValueError("Audio chunk coverage gap or overlap")
                cursors[key] = (index + 1, chunk.end)
        elif (
            self.source_media_id
            or self.audio_coverage
            or self.coverage != "provided_text"
            or self.format == "json"
        ):
            raise ValueError("Invalid supplied transcript provenance")
        return self

    @field_validator("id")
    @classmethod
    def valid_id(cls, value: str) -> str:
        UUID(value)
        return value


class TranscriptPaste(TranscriptModel):
    text: str = Field(min_length=1, max_length=MAX_TRANSCRIPT_BYTES)
    format: Literal["txt", "srt", "vtt"] = "txt"


class TranscriptResponse(TranscriptModel):
    generation: int
    transcript: CurrentTranscript | None
    attachment_only: bool
