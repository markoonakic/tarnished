from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.analytics import CalculationScope, CurrentRecordBasis
from app.schemas.application import StatusResponse
from app.schemas.evidence import HistoryEvidence


class DashboardKPIsResponse(BaseModel):
    scope: CalculationScope
    current_record_basis: CurrentRecordBasis
    unknown_opportunities: int
    last_7_days: int
    last_7_days_trend: float | None
    last_30_days: int
    last_30_days_trend: float | None
    active_opportunities: int


class NeedsAttentionItem(BaseModel):
    id: str
    company: str
    job_title: str
    days_since: int
    reason: str
    current_stage_age_hours: float | None


class NeedsAttentionResponse(BaseModel):
    scope: CalculationScope
    current_record_basis: CurrentRecordBasis
    follow_ups: list[NeedsAttentionItem]
    no_responses: list[NeedsAttentionItem]
    interviewing: list[NeedsAttentionItem]


class ApplicationStatusHistoryResponse(HistoryEvidence):
    model_config = ConfigDict(from_attributes=True)

    id: str
    from_status: StatusResponse | None
    to_status: StatusResponse | None
    changed_at: datetime
    note: str | None

    @field_validator("changed_at")
    @classmethod
    def history_time_is_utc(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value
