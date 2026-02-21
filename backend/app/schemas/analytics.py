from datetime import datetime

from pydantic import BaseModel


class SankeyNode(BaseModel):
    id: str
    name: str
    color: str | None = None
    value: int | None = None  # Explicit value for nodes without incoming links


class SankeyLink(BaseModel):
    source: str
    target: str
    value: int


class SankeyData(BaseModel):
    nodes: list[SankeyNode]
    links: list[SankeyLink]


class HeatmapDay(BaseModel):
    date: str
    count: int


class HeatmapData(BaseModel):
    days: list[HeatmapDay]
    max_count: int


class AnalyticsKPIsResponse(BaseModel):
    total_applications: int
    interviews: int
    offers: int
    application_to_interview_rate: float
    response_rate: float
    active_opportunities: int


# Interview Rounds Analytics Schemas


class FunnelData(BaseModel):
    round: str
    count: int
    passed: int
    conversion_rate: float


class OutcomeData(BaseModel):
    round: str
    passed: int
    failed: int
    pending: int
    withdrew: int


class TimelineData(BaseModel):
    round: str
    avg_days: float


class RoundProgress(BaseModel):
    round_type: str
    outcome: str | None
    completed_at: datetime | None
    days_in_round: int | None


class CandidateProgress(BaseModel):
    application_id: str
    candidate_name: str
    role: str
    rounds_completed: list[RoundProgress]
    current_status: str


class InterviewRoundsResponse(BaseModel):
    funnel_data: list[FunnelData]
    outcome_data: list[OutcomeData]
    timeline_data: list[TimelineData]
    candidate_progress: list[CandidateProgress]
