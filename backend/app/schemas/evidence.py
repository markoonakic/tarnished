"""Explicit evidence inputs; status spelling is never evidence."""

from datetime import UTC, date, datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    field_validator,
    model_validator,
)

Meaning = Literal[
    "preparing",
    "unknown",
    "applied",
    "screening",
    "interviewing",
    "offer",
    "accepted",
    "rejected",
    "withdrawn",
    "no_reply",
]
Provenance = Literal["recorded", "legacy_unknown"]
ResponseState = Literal["not_recorded", "recorded", "legacy_unknown"]


class ResponseEvidenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurred_on: date | None = None
    reference: str | None = Field(None, max_length=2000)


class CurrentMeaningCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    meaning: Meaning
    expected_revision: int = Field(ge=0)


class HistoryCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0)
    from_meaning: Meaning | None = None
    to_meaning: Meaning | None = None
    changed_at: datetime | None = None
    correction_note: str | None = Field(None, max_length=2000)

    @field_validator("from_meaning", "to_meaning", "changed_at")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Omit unchanged fields; null is not allowed")
        return value

    @field_validator("changed_at")
    @classmethod
    def validate_timestamp(cls, value):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("A timezone offset is required")
        if value > datetime.now(UTC):
            raise ValueError("History cannot occur in the future")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def require_correction(self):
        if not self.model_fields_set.intersection(
            {"from_meaning", "to_meaning", "changed_at"}
        ):
            raise ValueError("Supply a meaning or timestamp correction")
        return self


class ApplicationEvidence(BaseModel):
    status_meaning: Meaning
    status_meaning_provenance: Provenance
    evidence_revision: int = Field(ge=0, strict=True)
    response_state: ResponseState
    response_occurred_on: date | None
    response_recorded_at: datetime | None
    response_reference: str | None = Field(max_length=2000)

    @field_validator("response_recorded_at")
    @classmethod
    def recording_time_is_utc(cls, value):
        return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value

    @model_validator(mode="after")
    def coherent_response(self):
        if self.response_state == "recorded":
            if self.response_recorded_at is None:
                raise ValueError("Recorded response requires recording time")
        elif any(
            value is not None
            for value in (
                self.response_occurred_on,
                self.response_recorded_at,
                self.response_reference,
            )
        ):
            raise ValueError("Unrecorded response cannot contain evidence")
        return self


class HistoryEvidence(BaseModel):
    from_meaning: Meaning | None
    to_meaning: Meaning | None
    from_meaning_provenance: Provenance
    to_meaning_provenance: Provenance
    time_provenance: Provenance
    is_gap: StrictBool
    corrected_at: datetime | None
    correction_note: str | None = Field(max_length=2000)

    @field_validator("corrected_at")
    @classmethod
    def correction_time_is_utc(cls, value):
        return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value


class HistoryArchiveEvidence(HistoryEvidence):
    from_status_id: str | None
    to_status_id: str | None
    changed_at: datetime
    note: str | None

    @model_validator(mode="after")
    def coherent_gap(self):
        if self.is_gap:
            if any(
                value is not None
                for value in (
                    self.from_status_id,
                    self.to_status_id,
                    self.from_meaning,
                    self.to_meaning,
                    self.note,
                    self.corrected_at,
                    self.correction_note,
                )
            ):
                raise ValueError("Gap must be content-free")
        elif self.to_status_id is None:
            raise ValueError("Event requires a destination status")
        if not self.is_gap:
            for field in ("from_meaning", "to_meaning"):
                if (
                    getattr(self, field + "_provenance") == "recorded"
                    and getattr(self, field) is None
                    and (field != "from_meaning" or self.from_status_id is not None)
                ):
                    raise ValueError("Recorded meaning requires a snapshot")
        return self
