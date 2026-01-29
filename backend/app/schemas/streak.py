from datetime import date

from pydantic import BaseModel


class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    total_activity_days: int
    last_activity_date: str | None
    ember_active: bool
    flame_stage: int
    flame_name: str
    flame_art: str
    streak_exhausted_at: date | None = None
