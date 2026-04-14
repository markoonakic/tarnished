from datetime import date
from enum import StrEnum

from pydantic import BaseModel


class StreakState(StrEnum):
    DORMANT = "dormant"
    BURNING = "burning"
    EMBER = "ember"
    EXTINGUISHED = "extinguished"


class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    total_activity_days: int
    last_activity_date: date | None = None
    ember_active: bool
    state: StreakState
    is_recently_extinguished: bool = False
    flame_stage: int
    flame_name: str
    flame_art: str
    streak_exhausted_at: date | None = None
