from datetime import UTC, date, datetime, timedelta
from typing import TypedDict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_api_key_scope
from app.models import User
from app.schemas.streak import StreakResponse, StreakState

router = APIRouter(prefix="/api/streak", tags=["streak"])

RECENTLY_EXTINGUISHED_WINDOW_DAYS = 7


class FlameStage(TypedDict):
    stage: int
    name: str
    min_days: int
    max_days: int
    art: str


FLAME_STAGES: list[FlameStage] = [
    {"stage": 0, "name": "Dormant", "min_days": 0, "max_days": 0, "art": ""},
    {"stage": 1, "name": "First Ember", "min_days": 1, "max_days": 1, "art": "░░"},
    {
        "stage": 2,
        "name": "Flickering Ember",
        "min_days": 2,
        "max_days": 2,
        "art": "░░░░",
    },
    {"stage": 3, "name": "Glowing Ember", "min_days": 3, "max_days": 3, "art": "░██░"},
    {
        "stage": 4,
        "name": "Awakening Spark",
        "min_days": 4,
        "max_days": 4,
        "art": "░░██░",
    },
    {"stage": 5, "name": "Growing Spark", "min_days": 5, "max_days": 5, "art": "░███░"},
    {
        "stage": 6,
        "name": "Bright Spark",
        "min_days": 6,
        "max_days": 6,
        "art": "░░███░░",
    },
    {"stage": 7, "name": "Tiny Flame", "min_days": 7, "max_days": 7, "art": "░████░"},
    {"stage": 8, "name": "Small Flame", "min_days": 8, "max_days": 9, "art": "░█████░"},
    {
        "stage": 9,
        "name": "Steady Flame",
        "min_days": 10,
        "max_days": 14,
        "art": "░██████░",
    },
    {
        "stage": 10,
        "name": "Burning Flame",
        "min_days": 15,
        "max_days": 21,
        "art": "░████████░",
    },
    {
        "stage": 11,
        "name": "Roaring Flame",
        "min_days": 22,
        "max_days": 30,
        "art": "░█████████░",
    },
    {
        "stage": 12,
        "name": "Blaze",
        "min_days": 31,
        "max_days": 45,
        "art": "██████████░",
    },
    {
        "stage": 13,
        "name": "Inferno",
        "min_days": 46,
        "max_days": 60,
        "art": "████████████",
    },
    {
        "stage": 14,
        "name": "Supernova",
        "min_days": 61,
        "max_days": 90,
        "art": "████████████░",
    },
    {
        "stage": 15,
        "name": "Legendary",
        "min_days": 91,
        "max_days": 99999,
        "art": "████████████████",
    },
]


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _validate_time_zone_name(value: str | None) -> str | None:
    if not value:
        return None

    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError:
        return None

    return value


def _get_user_time_zone_name(user: User, *, x_timezone: str | None = None) -> str | None:
    request_zone = _validate_time_zone_name(x_timezone)
    if request_zone is not None:
        return request_zone

    prefs = user.settings if isinstance(user.settings, dict) else {}
    stored_zone = prefs.get("time_zone")
    if isinstance(stored_zone, str):
        return _validate_time_zone_name(stored_zone)

    return None


def _today(user: User, *, x_timezone: str | None = None) -> date:
    time_zone_name = _get_user_time_zone_name(user, x_timezone=x_timezone)
    if time_zone_name is None:
        return _utc_now().date()

    return _utc_now().astimezone(ZoneInfo(time_zone_name)).date()


def _exhausted_date(last_activity_date: date) -> date:
    return last_activity_date + timedelta(days=2)


def _sync_streak_state(user: User, *, today: date) -> tuple[bool, bool]:
    """Normalize persisted streak state and return (changed, ember_active)."""
    changed = False
    ember_active = False

    if user.last_activity_date is None:
        if user.ember_active:
            user.ember_active = False
            changed = True
        return changed, ember_active

    days_since_last = (today - user.last_activity_date).days

    if user.current_streak > 0 and days_since_last == 1:
        ember_active = True
        if not user.ember_active:
            user.ember_active = True
            changed = True
        if user.streak_exhausted_at is not None:
            user.streak_exhausted_at = None
            changed = True
        return changed, ember_active

    if user.ember_active:
        user.ember_active = False
        changed = True

    if user.current_streak > 0 and user.streak_exhausted_at is not None:
        user.streak_exhausted_at = None
        changed = True

    if days_since_last >= 2:
        if user.current_streak != 0:
            user.current_streak = 0
            changed = True
        if user.streak_start_date is not None:
            user.streak_start_date = None
            changed = True

        exhausted_at = _exhausted_date(user.last_activity_date)
        if user.longest_streak > 0 and user.streak_exhausted_at != exhausted_at:
            user.streak_exhausted_at = exhausted_at
            changed = True

    return changed, ember_active


def _derive_streak_state(user: User, *, today: date) -> tuple[StreakState, bool]:
    if user.current_streak > 0:
        if user.last_activity_date and (today - user.last_activity_date).days == 1:
            return StreakState.EMBER, False
        return StreakState.BURNING, False

    if user.longest_streak > 0:
        is_recently_extinguished = (
            user.streak_exhausted_at is not None
            and (today - user.streak_exhausted_at).days
            <= RECENTLY_EXTINGUISHED_WINDOW_DAYS
        )
        return StreakState.EXTINGUISHED, is_recently_extinguished

    return StreakState.DORMANT, False


async def record_streak_activity(
    user: User,
    db: AsyncSession,
    *,
    x_timezone: str | None = None,
) -> dict:
    """Record activity that counts toward the user's streak."""
    today = _today(user, x_timezone=x_timezone)
    changed, _ = _sync_streak_state(user, today=today)

    if user.last_activity_date is None:
        user.current_streak = 1
        user.longest_streak = 1
        user.total_activity_days = 1
        user.last_activity_date = today
        user.streak_start_date = today
        user.ember_active = False
        changed = True
    else:
        days_since_last = (today - user.last_activity_date).days

        if days_since_last == 1 and user.current_streak > 0:
            user.current_streak += 1
            user.total_activity_days += 1
            user.last_activity_date = today
            user.ember_active = False
            user.streak_exhausted_at = None
            if user.current_streak > user.longest_streak:
                user.longest_streak = user.current_streak
            changed = True
        elif days_since_last != 0:
            user.current_streak = 1
            user.total_activity_days += 1
            user.last_activity_date = today
            user.streak_start_date = today
            user.ember_active = False
            user.streak_exhausted_at = None
            if user.longest_streak == 0:
                user.longest_streak = 1
            changed = True

    if changed:
        await db.commit()

    return {"message": "Activity recorded", "current_streak": user.current_streak}


def get_flame_stage(streak_days: int) -> FlameStage:
    """Return flame stage data based on streak length."""
    for stage in FLAME_STAGES:
        if stage["min_days"] <= streak_days <= stage["max_days"]:
            return stage
    return FLAME_STAGES[0]


@router.get("", response_model=StreakResponse)
async def get_streak(
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("streak:read")),
    db: AsyncSession = Depends(get_db),
    x_timezone: str | None = Header(default=None),
):
    """Get current streak information for Flame of Focus display."""
    today = _today(user, x_timezone=x_timezone)
    changed, ember_active = _sync_streak_state(user, today=today)
    if changed:
        await db.commit()

    state, is_recently_extinguished = _derive_streak_state(user, today=today)
    flame_stage = get_flame_stage(user.current_streak)

    return StreakResponse(
        current_streak=user.current_streak,
        longest_streak=user.longest_streak,
        total_activity_days=user.total_activity_days,
        last_activity_date=user.last_activity_date,
        ember_active=ember_active,
        state=state,
        is_recently_extinguished=is_recently_extinguished,
        flame_stage=flame_stage["stage"],
        flame_name=flame_stage["name"],
        flame_art=flame_stage["art"],
        streak_exhausted_at=user.streak_exhausted_at,
    )


@router.post("/record")
async def record_activity(
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("streak:write")),
    db: AsyncSession = Depends(get_db),
    x_timezone: str | None = Header(default=None),
):
    """Record activity that counts toward streak."""
    return await record_streak_activity(user=user, db=db, x_timezone=x_timezone)
