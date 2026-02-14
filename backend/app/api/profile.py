"""User Profile API router.

This module provides API endpoints for managing user profiles, including:
- Creating and updating user profiles
- Retrieving user profile information
- Managing personal information, work authorization, and extended profile data

All endpoints require authentication via Bearer token.
"""

from fastapi import APIRouter, Depends
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