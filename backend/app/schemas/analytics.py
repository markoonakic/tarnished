from datetime import date, datetime

from pydantic import BaseModel


class CalculationScope(BaseModel):
    period: str
    cohort_start: date | None
    cohort_end: date
    as_of: datetime
    time_zone: str
    denominator: int
    basis: str


class CurrentRecordBasis(BaseModel):
    observed_at: datetime
    basis: str


class StageVisit(BaseModel):
    application_id: str
    entry_id: str
    exit_id: str | None
    meaning: str
    entered_at: datetime
    ended_at: datetime | None
    kind: str
    hours: float | None
    reason: str | None


class StageTotal(BaseModel):
    application_id: str
    meaning: str
    hours: float


class ApplicationEvidenceMetrics(BaseModel):
    application_id: str
    company: str
    job_title: str
    source: str | None = None
    applied_at: date
    evidence_revision: int
    current_meaning: str
    as_of_meaning: str
    response_recorded: bool
    response_state: str
    response_occurred_on: date | None
    response_recorded_at: datetime | None
    current_stage_age_hours: (
        float | None
    )  # Active visit at scope.as_of, not live-record age.
    missing_prefix: bool
    gap_ids: list[str]
    unknown_history_ids: list[str]
    ambiguous_time_ids: list[str]


class PipelineMetrics(BaseModel):
    repeated_requirements: dict = {}
    missing_evidence: dict = {}
    first_response: dict = {}
    rejected_count: int = 0
    outcomes_by_source: list[dict] = []
    top_positions: list[dict] = []
    top_technologies: list[dict] = []
    stage_averages: list[dict] = []
    current_phases: list[dict] = []
    scope: CalculationScope
    current_record_basis: CurrentRecordBasis
    total_applications: int
    responded: int
    response_rate: float | None
    response_unknown: int
    response_undated: int
    response_not_recorded_as_of: int
    interviews: int
    offers: int
    interview_rate: float | None
    offer_rate: float | None
    active_applications: int
    closed_applications: int
    unknown_applications: int
    current_stage_breakdown: dict[str, int]
    stage_breakdown: dict[str, int]
    applications: list[ApplicationEvidenceMetrics]
    visits: list[StageVisit]
    stage_totals: list[StageTotal]
    coverage: dict[str, int]


class SankeyNode(BaseModel):
    builtin_key: str | None = None
    id: str
    name: str
    meaning: str
    application_id: str
    entered_at: datetime
    color: str | None = None
    value: int | None = None


class SankeyLink(BaseModel):
    source: str
    target: str
    value: int


class SankeyData(BaseModel):
    nodes: list[SankeyNode]
    links: list[SankeyLink]
    scope: CalculationScope
    coverage: dict[str, int]


class HeatmapDay(BaseModel):
    date: str
    count: int


class HeatmapData(BaseModel):
    days: list[HeatmapDay]
    max_count: int


class AnalyticsKPIsResponse(PipelineMetrics):
    application_to_interview_rate: float | None
    active_opportunities: int


class FunnelData(BaseModel):
    builtin_key: str | None = None
    round: str
    count: int
    passed: int
    conversion_rate: float


class OutcomeData(BaseModel):
    builtin_key: str | None = None
    round: str
    passed: int
    failed: int
    pending: int
    withdrew: int


class TimelineData(BaseModel):
    builtin_key: str | None = None
    round: str
    avg_days: float
    avg_hours: float | None = None


class RoundProgress(BaseModel):
    round_type: str
    outcome: str | None
    scheduled_at: datetime | None
    completed_at: datetime | None
    days_in_round: float | None


class CandidateProgress(BaseModel):
    application_id: str
    candidate_name: str
    role: str
    rounds_completed: list[RoundProgress]
    current_status: str


class InterviewRoundsResponse(BaseModel):
    scope: CalculationScope
    duration_basis: str
    funnel_data: list[FunnelData]
    outcome_data: list[OutcomeData]
    timeline_data: list[TimelineData]
    candidate_progress: list[CandidateProgress]
