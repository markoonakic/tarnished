from datetime import datetime

from pydantic import BaseModel

from app.schemas.admin import (
    AdminRoundTypeUpdate,
    AdminStatsResponse,
    AdminStatusUpdate,
    AdminUserResponse,
    AdminUserUpdate,
)
from app.schemas.ai_settings import (
    AISettingsResponse,
    AISettingsUpdate,
)
from app.schemas.analytics import (
    HeatmapData,
    HeatmapDay,
    SankeyData,
    SankeyLink,
    SankeyNode,
)
from app.schemas.application import (
    ApplicationCreate,
    ApplicationListResponse,
    ApplicationResponse,
    ApplicationUpdate,
    StatusResponse,
)
from app.schemas.auth import Token, TokenRefresh, UserCreate, UserLogin, UserResponse
from app.schemas.job_lead import (
    JobLeadCreate,
    JobLeadExtractionInput,
    JobLeadListItem,
    JobLeadListResponse,
    JobLeadResponse,
    JobLeadStatus,
)
from app.schemas.round import (
    RoundCreate,
    RoundMediaResponse,
    RoundResponse,
    RoundTypeResponse,
    RoundUpdate,
)
from app.schemas.settings import (
    RoundTypeCreate,
    RoundTypeFullResponse,
    StatusCreate,
    StatusFullResponse,
)
from app.schemas.streak import StreakResponse
from app.schemas.user_profile import (
    EducationItem,
    UserProfileCreate,
    UserProfileResponse,
    UserProfileUpdate,
    WorkHistoryItem,
)


class DashboardKPIsResponse(BaseModel):
    last_7_days: int
    last_7_days_trend: float
    last_30_days: int
    last_30_days_trend: float
    active_opportunities: int


class NeedsAttentionItem(BaseModel):
    id: str
    company: str
    job_title: str
    days_since: int


class NeedsAttentionResponse(BaseModel):
    follow_ups: list[NeedsAttentionItem]
    no_responses: list[NeedsAttentionItem]
    interviewing: list[NeedsAttentionItem]


class ApplicationStatusHistoryResponse(BaseModel):
    id: str
    from_status: StatusResponse | None
    to_status: StatusResponse
    changed_at: datetime
    note: str | None

    class Config:
        from_attributes = True


__all__ = [
    "StreakResponse",
    "Token",
    "TokenRefresh",
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "ApplicationCreate",
    "ApplicationUpdate",
    "ApplicationResponse",
    "ApplicationListResponse",
    "StatusResponse",
    "RoundCreate",
    "RoundUpdate",
    "RoundResponse",
    "RoundTypeResponse",
    "RoundMediaResponse",
    "StatusCreate",
    "StatusFullResponse",
    "RoundTypeCreate",
    "RoundTypeFullResponse",
    "SankeyData",
    "SankeyNode",
    "SankeyLink",
    "HeatmapData",
    "HeatmapDay",
    "AdminUserResponse",
    "AdminUserUpdate",
    "AdminStatsResponse",
    "AdminStatusUpdate",
    "AdminRoundTypeUpdate",
    "DashboardKPIsResponse",
    "ApplicationStatusHistoryResponse",
    "NeedsAttentionItem",
    "NeedsAttentionResponse",
    # Job Lead schemas
    "JobLeadCreate",
    "JobLeadResponse",
    "JobLeadListItem",
    "JobLeadListResponse",
    "JobLeadExtractionInput",
    "JobLeadStatus",
    # User Profile schemas
    "UserProfileCreate",
    "UserProfileUpdate",
    "UserProfileResponse",
    "WorkHistoryItem",
    "EducationItem",
    # AI Settings schemas
    "AISettingsUpdate",
    "AISettingsResponse",
]
