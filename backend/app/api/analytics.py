from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, ApplicationStatus, User
from app.schemas.analytics import HeatmapData, HeatmapDay, SankeyData, SankeyLink, SankeyNode

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/sankey", response_model=SankeyData)
async def get_sankey_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            Application.status_id,
            ApplicationStatus.name,
            ApplicationStatus.color,
            func.count(Application.id),
        )
        .join(ApplicationStatus)
        .where(Application.user_id == user.id)
        .group_by(Application.status_id, ApplicationStatus.name, ApplicationStatus.color)
    )
    status_counts = result.all()

    if not status_counts:
        return SankeyData(nodes=[], links=[])

    nodes = [SankeyNode(id="applications", name="Applications", color="#8ec07c")]

    for status_id, status_name, status_color, _ in status_counts:
        nodes.append(SankeyNode(id=status_id, name=status_name, color=status_color))

    links = []
    for status_id, _, _, count in status_counts:
        links.append(SankeyLink(
            source="applications",
            target=status_id,
            value=count,
        ))

    return SankeyData(nodes=nodes, links=links)


@router.get("/heatmap", response_model=HeatmapData)
async def get_heatmap_data(
    year: int | None = None,
    rolling: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()

    if rolling or (year is None):
        # Default: rolling 12 months
        end_date = today
        start_date = date(today.year - 1, today.month, today.day)
    else:
        # Specific year: full calendar year
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

    result = await db.execute(
        select(Application.applied_at, func.count(Application.id))
        .where(
            Application.user_id == user.id,
            Application.applied_at >= start_date,
            Application.applied_at <= end_date,
        )
        .group_by(Application.applied_at)
        .order_by(Application.applied_at)
    )
    daily_counts = result.all()

    days = [
        HeatmapDay(date=str(applied_at), count=count)
        for applied_at, count in daily_counts
    ]

    max_count = max((d.count for d in days), default=0)

    return HeatmapData(days=days, max_count=max_count)
