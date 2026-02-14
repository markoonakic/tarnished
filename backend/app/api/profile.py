"""User Profile API router.

This module provides API endpoints for managing user profiles, including:
- Creating and updating user profiles
- Retrieving user profile information
- Managing personal information, work authorization, and extended profile data

All endpoints require authentication via Bearer token.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.models.user_profile import UserProfile
from app.schemas.user_profile import (
    UserProfileCreate,
    UserProfileResponse,
    UserProfileUpdate,
)

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("", response_model=UserProfileResponse)
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Get the current user's profile, creating an empty one if it doesn't exist.

    Args:
        user: The authenticated user
        db: Database session

    Returns:
        The user's profile, with empty fields if newly created
    """
    # Check if profile exists
    query = select(UserProfile).where(UserProfile.user_id == user.id)
    result = await db.execute(query)
    profile = result.scalar_one_or_none()

    if profile is None:
        # Create empty profile
        profile = UserProfile(user_id=user.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    return profile