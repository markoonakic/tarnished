from sqlalchemy.ext.asyncio import AsyncSession

from app.api.streak import record_streak_activity
from app.models import User


async def record_activity_streak(
    db: AsyncSession,
    user: User,
):
    """
    Record meaningful activity toward streak.

    Call this after any meaningful job search action:
    - Creating an application
    - Changing application status
    - Creating an interview round
    - Updating interview round (notes, media, transcript)
    """
    await record_streak_activity(user=user, db=db)
