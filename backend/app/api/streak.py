from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.schemas.streak import StreakResponse

router = APIRouter(prefix="/api/streak", tags=["streak"])


async def record_streak_activity(
    user: User,
    db: AsyncSession,
) -> dict:
    """
    Record activity that counts toward streak.

    This is a helper function that can be called from other endpoints.
    The POST /record endpoint delegates to this function.
    """
    today = date.today()

    # First activity ever
    if not user.streak_start_date:
        user.current_streak = 1
        user.longest_streak = 1
        user.total_activity_days = 1
        user.last_activity_date = today
        user.streak_start_date = today
        user.ember_active = False
    else:
        days_since_last = (today - user.last_activity_date).days

        if days_since_last == 0:
            # Already recorded today, do nothing
            pass
        elif days_since_last == 1:
            # Continued streak (or recovered from ember)
            user.current_streak += 1
            user.total_activity_days += 1
            user.last_activity_date = today
            user.ember_active = False

            # Update longest if needed
            if user.current_streak > user.longest_streak:
                user.longest_streak = user.current_streak
        elif days_since_last >= 2:
            # Streak extinguished, start over
            user.current_streak = 1
            user.total_activity_days += 1
            user.last_activity_date = today
            user.streak_start_date = today
            user.ember_active = False

    await db.commit()

    return {"message": "Activity recorded", "current_streak": user.current_streak}

# 15 flame stages with art, name, min_days, max_days
FLAME_STAGES = [
    {"stage": 1, "name": "First Ember", "min_days": 1, "max_days": 1, "art": "░░"},
    {"stage": 2, "name": "Flickering Ember", "min_days": 2, "max_days": 2, "art": "░░░░"},
    {"stage": 3, "name": "Glowing Ember", "min_days": 3, "max_days": 3, "art": "░██░"},
    {"stage": 4, "name": "Awakening Spark", "min_days": 4, "max_days": 4, "art": "░░██░"},
    {"stage": 5, "name": "Growing Spark", "min_days": 5, "max_days": 5, "art": "░███░"},
    {"stage": 6, "name": "Bright Spark", "min_days": 6, "max_days": 6, "art": "░░███░░"},
    {"stage": 7, "name": "Tiny Flame", "min_days": 7, "max_days": 7, "art": "░████░"},
    {"stage": 8, "name": "Small Flame", "min_days": 8, "max_days": 9, "art": "░█████░"},
    {"stage": 9, "name": "Steady Flame", "min_days": 10, "max_days": 14, "art": "░██████░"},
    {"stage": 10, "name": "Burning Flame", "min_days": 15, "max_days": 21, "art": "░████████░"},
    {"stage": 11, "name": "Roaring Flame", "min_days": 22, "max_days": 30, "art": "░█████████░"},
    {"stage": 12, "name": "Blaze", "min_days": 31, "max_days": 45, "art": "██████████░"},
    {"stage": 13, "name": "Inferno", "min_days": 46, "max_days": 60, "art": "████████████"},
    {"stage": 14, "name": "Supernova", "min_days": 61, "max_days": 90, "art": "████████████░"},
    {"stage": 15, "name": "Legendary", "min_days": 91, "max_days": 99999, "art": "████████████████"},
]


def get_flame_stage(streak_days: int) -> dict:
    """Return flame stage data based on streak length."""
    for stage in FLAME_STAGES:
        if stage["min_days"] <= streak_days <= stage["max_days"]:
            return stage
    return FLAME_STAGES[0]


@router.get("", response_model=StreakResponse)
async def get_streak(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current streak information for Flame of Focus display."""
    today = date.today()
    ember_active = False

    if user.last_activity_date:
        days_since = (today - user.last_activity_date).days
        if days_since == 1:
            ember_active = True
        elif days_since >= 2:
            # Streak extinguished, reset
            user.current_streak = 0
            user.ember_active = False
            user.streak_start_date = None

            # Set streak_exhausted_at when streak goes to 0 after grace period
            if user.longest_streak > 0 and user.streak_exhausted_at is None:
                user.streak_exhausted_at = date.today()

            await db.commit()

    # Clear streak_exhausted_at when streak becomes active again
    if user.current_streak > 0 and user.streak_exhausted_at is not None:
        user.streak_exhausted_at = None
        await db.commit()

    flame_stage = get_flame_stage(user.current_streak)

    return StreakResponse(
        current_streak=user.current_streak,
        longest_streak=user.longest_streak,
        total_activity_days=user.total_activity_days,
        last_activity_date=user.last_activity_date.isoformat() if user.last_activity_date else None,
        ember_active=ember_active,
        flame_stage=flame_stage["stage"],
        flame_name=flame_stage["name"],
        flame_art=flame_stage["art"],
        streak_exhausted_at=user.streak_exhausted_at,
    )


@router.post("/record")
async def record_activity(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record activity that counts toward streak."""
    return await record_streak_activity(user=user, db=db)
