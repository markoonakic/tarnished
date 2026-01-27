from datetime import datetime

from app.schemas.auth import Token, TokenRefresh, UserCreate, UserLogin, UserResponse
from app.schemas.application import (
    ApplicationCreate,
    ApplicationUpdate,
    ApplicationResponse,
    ApplicationListResponse,
    StatusResponse,
)
from app.schemas.round import (
    RoundCreate,
    RoundUpdate,
    RoundResponse,
    RoundTypeResponse,
    RoundMediaResponse,
)
from app.schemas.settings import (
    StatusCreate,
    StatusFullResponse,
    RoundTypeCreate,
    RoundTypeFullResponse,
)
from app.schemas.analytics import (
    SankeyData,
    SankeyNode,
    SankeyLink,
    HeatmapData,
    HeatmapDay,
)
from app.schemas.admin import (
    AdminUserResponse,
    AdminUserUpdate,
    AdminStatsResponse,
    AdminStatusUpdate,
    AdminRoundTypeUpdate,
)

from pydantic import BaseModel


class DashboardKPIsResponse(BaseModel):
    last_7_days: int
    last_7_days_trend: float
    last_30_days: int
    last_30_days_trend: float
    active_opportunities: int


class ApplicationStatusHistoryResponse(BaseModel):
    id: str
    from_status: StatusResponse | None
    to_status: StatusResponse
    changed_at: datetime
    note: str | None

    class Config:
        from_attributes = True


__all__ = [
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
]
