"""User Profile API router.

This module provides API endpoints for managing user profiles, including:
- Creating and updating user profiles
- Retrieving user profile information
- Managing personal information, work authorization, and extended profile data

All endpoints require authentication via Bearer token.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import (
    get_current_user,
    get_current_user_flexible,
    require_api_key_scope,
)
from app.models import User
from app.models.user_profile import UserProfile
from app.schemas.user_profile import (
    UserProfileResponse,
    UserProfileUpdate,
)
from app.services.ai_settings import lock_ai_settings
from app.services.interview_jobs import invalidate_interviews
from app.services.profile_items import ITEM_FIELDS, PROFILE_FIELDS, normalize_items

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
        **{field: getattr(profile, field) for field in PROFILE_FIELDS},
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
    _: object = Depends(require_api_key_scope("profile:read")),
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
        result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == user.id)
        )
        profile = result.scalar_one()

    await db.commit()
    return _build_profile_response(profile, user)


@router.put("", response_model=UserProfileResponse)
async def update_profile(
    profile_update: UserProfileUpdate,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("profile:write")),
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
    await lock_ai_settings(db)
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
        result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == user.id)
        )
        profile = result.scalar_one()

    # Extract only the fields that were provided in the request
    update_data = profile_update.model_dump(exclude_unset=True)

    expected = update_data.pop("expected_revision", None)
    revision = profile.revision
    if expected is not None and expected != revision:
        raise HTTPException(409, "Profile changed; reload and retry")
    if "skills" in update_data and "skill_items" not in update_data:
        update_data["skill_items"] = [
            {"name": name} for name in update_data["skills"] or []
        ]
    try:
        for field in ITEM_FIELDS:
            if field in update_data:
                update_data[field] = normalize_items(
                    update_data[field], getattr(profile, field)
                )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    identifiers = [
        item["id"]
        for field in ITEM_FIELDS
        for item in (update_data.get(field, getattr(profile, field)) or [])
        if isinstance(item, dict) and item.get("id")
    ]
    if len(identifiers) != len(set(identifiers)):
        raise HTTPException(422, "Profile item IDs must be unique across sections")
    if "skill_items" in update_data:
        update_data["skills"] = [
            item["name"]
            for item in update_data["skill_items"]
            if isinstance(item.get("name"), str)
        ]
    if "ai_permissions" in update_data:
        update_data["ai_permissions"] = {
            **(profile.ai_permissions or {}),
            **update_data["ai_permissions"],
        }
    permission_changed = (
        "ai_permissions" in update_data
        and update_data["ai_permissions"] != profile.ai_permissions
    )
    from app.services.profile_items import allowed_profile

    prospective = {
        column.key: getattr(profile, column.key)
        for column in UserProfile.__table__.columns
    }
    prospective.update(update_data)
    if allowed_profile(profile) != allowed_profile(prospective):
        await invalidate_interviews(db, user_id=user.id, removed=True)
    changed = await db.scalar(
        update(UserProfile)
        .where(
            UserProfile.id == profile.id,
            UserProfile.user_id == user.id,
            UserProfile.revision == revision,
        )
        .values(
            revision=revision + 1,
            permission_revision=profile.permission_revision + int(permission_changed),
        )
        .returning(UserProfile.id)
        .execution_options(synchronize_session=False)
    )
    if changed is None:
        raise HTTPException(409, "Profile changed; reload and retry")
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
