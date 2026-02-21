"""User Profile API router.

This module provides API endpoints for managing user profiles, including:
- Creating and updating user profiles
- Retrieving user profile information
- Managing personal information, work authorization, and extended profile data

All endpoints require authentication via Bearer token.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_flexible
from app.models import User
from app.models.user_profile import UserProfile
from app.schemas.user_profile import (
    UserProfileResponse,
    UserProfileUpdate,
)

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _build_profile_response(profile: UserProfile, user: User) -> UserProfileResponse:
    """Build a profile response dict including user-level city/country fields.

    Args:
        profile: The user's UserProfile record
        user: The User record with city/country fields

    Returns:
        A dict that matches UserProfileResponse schema
    """
    return {  # type: ignore[return-value]
        "id": profile.id,
        "user_id": profile.user_id,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "email": profile.email,
        "phone": profile.phone,
        "location": profile.location,
        "linkedin_url": profile.linkedin_url,
        "city": user.city,
        "country": user.country,
        "authorized_to_work": profile.authorized_to_work,
        "requires_sponsorship": profile.requires_sponsorship,
        "work_history": profile.work_history,
        "education": profile.education,
        "skills": profile.skills,
    }


@router.get("", response_model=UserProfileResponse)
async def get_profile(
    user: User = Depends(get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Get the current user's profile, creating an empty one if it doesn't exist.

    Uses SAVEPOINT (nested transaction) to handle race conditions in a
    database-agnostic way. Works with both SQLite and PostgreSQL.

    Args:
        user: The authenticated user
        db: Database session

    Returns:
        The user's profile, with empty fields if newly created
    """
    # Check if profile exists
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = result.scalar_one_or_none()

    if profile is None:
        # Use nested transaction (SAVEPOINT) to handle race conditions
        # This is database-agnostic and works with both SQLite and PostgreSQL
        try:
            async with db.begin_nested():
                profile = UserProfile(user_id=user.id)
                db.add(profile)
                await db.flush()
        except IntegrityError:
            # Another concurrent request created the profile
            # The SAVEPOINT was rolled back, but outer transaction is still valid
            pass

        # Fetch the profile (either just created or created by concurrent request)
        result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
        profile = result.scalar_one()

    await db.commit()
    return _build_profile_response(profile, user)


@router.put("", response_model=UserProfileResponse)
async def update_profile(
    profile_update: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Update the current user's profile with partial update support.

    Only fields provided in the request will be updated. Fields not included
    in the request remain unchanged.

    Args:
        profile_update: The profile update data with optional fields
        user: The authenticated user
        db: Database session

    Returns:
        The updated user profile
    """
    # Check if profile exists
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = result.scalar_one_or_none()

    if profile is None:
        # Use nested transaction (SAVEPOINT) to handle race conditions
        try:
            async with db.begin_nested():
                profile = UserProfile(user_id=user.id)
                db.add(profile)
                await db.flush()
        except IntegrityError:
            # Another concurrent request created the profile
            pass

        # Fetch the profile
        result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
        profile = result.scalar_one()

    # Extract only the fields that were provided in the request
    update_data = profile_update.model_dump(exclude_unset=True)

    # Handle city and country separately (they're on the User model)
    if "city" in update_data:
        user.city = update_data.pop("city")
    if "country" in update_data:
        user.country = update_data.pop("country")

    # Update only the provided fields on the profile
    for field, value in update_data.items():
        setattr(profile, field, value)

    # Commit the changes
    await db.commit()
    await db.refresh(profile)

    return _build_profile_response(profile, user)
