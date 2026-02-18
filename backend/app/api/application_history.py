from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Application, ApplicationStatusHistory, User
from app.schemas.application import StatusResponse

router = APIRouter(prefix="/api/applications", tags=["application-history"])


@router.get("/{application_id}/history")
async def get_application_history(
    application_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify application belongs to user
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # Get history with status details
    result = await db.execute(
        select(ApplicationStatusHistory)
        .where(ApplicationStatusHistory.application_id == application_id)
        .options(
            selectinload(ApplicationStatusHistory.from_status),
            selectinload(ApplicationStatusHistory.to_status),
        )
        .order_by(ApplicationStatusHistory.changed_at.desc())
    )
    history_entries = result.scalars().all()

    # Convert to response format
    response_data = []
    for entry in history_entries:
        response_data.append(
            {
                "id": entry.id,
                "from_status": StatusResponse.model_validate(entry.from_status)
                if entry.from_status
                else None,
                "to_status": StatusResponse.model_validate(entry.to_status),
                "changed_at": entry.changed_at,
                "note": entry.note,
            }
        )

    return response_data


@router.delete(
    "/{application_id}/history/{history_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_history_entry(
    application_id: str,
    history_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify application belongs to user
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # Find history entry
    result = await db.execute(
        select(ApplicationStatusHistory).where(
            ApplicationStatusHistory.id == history_id,
            ApplicationStatusHistory.application_id == application_id,
        )
    )
    history_entry = result.scalars().first()

    if not history_entry:
        raise HTTPException(status_code=404, detail="History entry not found")

    await db.delete(history_entry)
    await db.commit()
