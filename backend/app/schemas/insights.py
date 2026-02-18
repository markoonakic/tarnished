from pydantic import BaseModel


class SectionInsight(BaseModel):
    """Insights for a single analytics section."""

    key_insight: str
    trend: str
    priority_actions: list[str]
    pattern: str | None = None


class GraceInsights(BaseModel):
    """Complete insights response for analytics page."""

    overall_grace: str
    pipeline_overview: SectionInsight
    interview_analytics: SectionInsight
    activity_tracking: SectionInsight


class InsightsRequest(BaseModel):
    """Request body for generating insights."""

    period: str  # "7d", "30d", "3m", "all"
