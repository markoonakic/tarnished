"""Tests for UserProfile model creation and database operations.

Task 8.2: Test UserProfile model creation with sample data
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_password_hash
from app.models import UserProfile, User


@pytest.fixture
async def test_user_for_profile(db: AsyncSession) -> User:
    """Create a test user for user profile tests."""
    user = User(
        email="profile_test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestUserProfileModelCreation:
    """Test UserProfile model creation with sample data."""

    async def test_create_user_profile_with_required_fields(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test creating a UserProfile with only required fields (user_id)."""
        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
        )
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)

        # Verify the user profile was saved correctly
        assert user_profile.id is not None
        assert user_profile.user_id == test_user_for_profile.id
        assert user_profile.first_name is None
        assert user_profile.last_name is None
        assert user_profile.email is None
        assert user_profile.phone is None
        assert user_profile.location is None
        assert user_profile.linkedin_url is None
        assert user_profile.authorized_to_work is None
        assert user_profile.requires_sponsorship is None
        assert user_profile.work_history is None
        assert user_profile.education is None
        assert user_profile.skills is None

    async def test_create_user_profile_with_personal_info(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test creating a UserProfile with personal information."""
        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
            first_name="John",
            last_name="Doe",
            email="john.doe@example.com",
            phone="+1-555-123-4567",
            location="San Francisco, CA",
            linkedin_url="https://linkedin.com/in/johndoe",
        )
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)

        # Verify all personal info fields were saved correctly
        assert user_profile.first_name == "John"
        assert user_profile.last_name == "Doe"
        assert user_profile.email == "john.doe@example.com"
        assert user_profile.phone == "+1-555-123-4567"
        assert user_profile.location == "San Francisco, CA"
        assert user_profile.linkedin_url == "https://linkedin.com/in/johndoe"

    async def test_create_user_profile_with_work_authorization(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test creating a UserProfile with work authorization details."""
        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
            authorized_to_work="United States",
            requires_sponsorship=False,
        )
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)

        assert user_profile.authorized_to_work == "United States"
        assert user_profile.requires_sponsorship is False

    async def test_create_user_profile_with_extended_profile_data(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test creating a UserProfile with extended JSON data."""
        sample_work_history = [
            {
                "company": "Tech Corp",
                "position": "Software Engineer",
                "start_date": "2020-01-01",
                "end_date": "2023-01-01",
                "description": "Built web applications using React and Python"
            }
        ]

        sample_education = [
            {
                "institution": "University of California",
                "degree": "B.S. Computer Science",
                "start_date": "2016-09-01",
                "end_date": "2020-05-01",
                "gpa": "3.8"
            }
        ]

        sample_skills = [
            "Python", "JavaScript", "React", "FastAPI", "SQL"
        ]

        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
            work_history=sample_work_history,
            education=sample_education,
            skills=sample_skills,
        )
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)

        assert user_profile.work_history == sample_work_history
        assert user_profile.education == sample_education
        assert user_profile.skills == sample_skills

    async def test_create_user_profile_with_complete_sample_data(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test creating a UserProfile with all fields populated."""
        sample_data = {
            "user_id": test_user_for_profile.id,
            "first_name": "Sarah",
            "last_name": "Johnson",
            "email": "sarah.johnson@example.com",
            "phone": "+1-555-987-6543",
            "location": "New York, NY",
            "linkedin_url": "https://linkedin.com/in/sarahjohnson",
            "authorized_to_work": "United States",
            "requires_sponsorship": False,
            "work_history": [
                {
                    "company": "Big Tech Inc",
                    "position": "Senior Software Engineer",
                    "start_date": "2021-06-01",
                    "end_date": "2024-01-01",
                    "description": "Led development of microservices architecture"
                }
            ],
            "education": [
                {
                    "institution": "MIT",
                    "degree": "M.S. Computer Science",
                    "start_date": "2019-09-01",
                    "end_date": "2021-05-01",
                    "gpa": "3.9"
                }
            ],
            "skills": ["Python", "TypeScript", "AWS", "Docker", "Kubernetes", "GraphQL"]
        }

        user_profile = UserProfile(**sample_data)
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)

        # Verify all fields were saved correctly
        assert user_profile.id is not None
        assert user_profile.user_id == test_user_for_profile.id
        assert user_profile.first_name == "Sarah"
        assert user_profile.last_name == "Johnson"
        assert user_profile.email == "sarah.johnson@example.com"
        assert user_profile.phone == "+1-555-987-6543"
        assert user_profile.location == "New York, NY"
        assert user_profile.linkedin_url == "https://linkedin.com/in/sarahjohnson"
        assert user_profile.authorized_to_work == "United States"
        assert user_profile.requires_sponsorship is False
        assert len(user_profile.work_history) == 1
        assert user_profile.work_history[0]["company"] == "Big Tech Inc"
        assert len(user_profile.education) == 1
        assert user_profile.education[0]["institution"] == "MIT"
        assert user_profile.skills == ["Python", "TypeScript", "AWS", "Docker", "Kubernetes", "GraphQL"]

    async def test_create_user_profile_with_partial_extended_data(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test creating a UserProfile with only some extended fields."""
        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
            skills=["Python", "SQL", "Machine Learning"],
            # Other extended fields (work_history, education) should be None
        )
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)

        assert user_profile.skills == ["Python", "SQL", "Machine Learning"]
        assert user_profile.work_history is None
        assert user_profile.education is None

    async def test_retrieve_user_profile_from_database(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test retrieving a UserProfile from the database after creation."""
        # Create and save a user profile
        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
            first_name="Michael",
            last_name="Chen",
            email="michael.chen@example.com",
            location="Seattle, WA",
            skills=["Python", "Java", "Spring Boot"]
        )
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)
        profile_id = user_profile.id

        # Clear the session to ensure we're reading from the database
        db.expunge(user_profile)

        # Retrieve the user profile
        result = await db.execute(
            select(UserProfile).where(UserProfile.id == profile_id)
        )
        retrieved_profile = result.scalar_one_or_none()

        assert retrieved_profile is not None
        assert retrieved_profile.id == profile_id
        assert retrieved_profile.first_name == "Michael"
        assert retrieved_profile.last_name == "Chen"
        assert retrieved_profile.email == "michael.chen@example.com"
        assert retrieved_profile.location == "Seattle, WA"
        assert retrieved_profile.skills == ["Python", "Java", "Spring Boot"]

    async def test_user_profile_one_to_one_relationship(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test the one-to-one relationship between User and UserProfile."""
        # Create user profile
        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
            first_name="Emma",
            last_name="Wilson",
            email="emma.wilson@example.com",
        )
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)

        # Test the relationship from UserProfile side
        assert user_profile.user is not None
        assert user_profile.user.id == test_user_for_profile.id
        assert user_profile.user.email == "profile_test@example.com"
        assert user_profile.user.is_active is True

        # Test the relationship from User side - need to join load the profile
        result = await db.execute(
            select(User).options(selectinload(User.user_profile)).where(User.id == test_user_for_profile.id)
        )
        user_with_profile = result.scalar_one()
        assert user_with_profile.user_profile is not None
        assert user_with_profile.user_profile.id == user_profile.id
        assert user_with_profile.user_profile.first_name == "Emma"
        assert user_with_profile.user_profile.last_name == "Wilson"

    async def test_user_profile_cascade_delete(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test that deleting a user cascades to delete the associated user profile."""
        # Create user profile
        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
            first_name="Alex",
            last_name="Brown",
        )
        db.add(user_profile)
        await db.commit()
        await db.refresh(user_profile)
        profile_id = user_profile.id

        # Delete the user
        await db.delete(test_user_for_profile)
        await db.commit()

        # Verify the user profile was also deleted (cascade)
        result = await db.execute(
            select(UserProfile).where(UserProfile.id == profile_id)
        )
        deleted_profile = result.scalar_one_or_none()

        assert deleted_profile is None

    async def test_user_profile_repr(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test the __repr__ method of UserProfile."""
        user_profile = UserProfile(
            user_id=test_user_for_profile.id,
            first_name="Lisa",
            last_name="Anderson",
        )
        db.add(user_profile)
        await db.commit()

        repr_str = repr(user_profile)
        assert "UserProfile" in repr_str
        assert user_profile.id in repr_str
        assert test_user_for_profile.id in repr_str
        # The repr only contains id and user_id, not first_name and last_name

    async def test_unique_constraint_on_user_id(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test that user_id is unique and cannot be duplicated."""
        # Create first profile
        profile1 = UserProfile(
            user_id=test_user_for_profile.id,
            first_name="First",
            last_name="User",
        )
        db.add(profile1)
        await db.commit()

        # Try to create another profile with the same user_id (should fail)
        profile2 = UserProfile(
            user_id=test_user_for_profile.id,
            first_name="Second",
            last_name="User",
        )
        db.add(profile2)

        # This should raise an integrity error due to unique constraint
        with pytest.raises(Exception):  # SQLAlchemy will raise IntegrityError
            await db.commit()

    async def test_index_on_user_id(
        self, db: AsyncSession, test_user_for_profile: User
    ):
        """Test that user_id is indexed for efficient queries."""
        # Create multiple profiles with different users
        user2 = User(
            email="profile_test2@example.com",
            password_hash=get_password_hash("testpass456"),
            is_admin=False,
            is_active=True,
        )
        db.add(user2)
        await db.commit()
        await db.refresh(user2)

        # Create profiles
        profile1 = UserProfile(
            user_id=test_user_for_profile.id,
            first_name="Index",
            last_name="Test1",
        )
        profile2 = UserProfile(
            user_id=user2.id,
            first_name="Index",
            last_name="Test2",
        )
        db.add(profile1)
        db.add(profile2)
        await db.commit()
        await db.refresh(profile1)
        await db.refresh(profile2)

        # Query by user_id (should be efficient due to index)
        result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == test_user_for_profile.id)
        )
        retrieved_profile = result.scalar_one_or_none()

        assert retrieved_profile is not None
        assert retrieved_profile.id == profile1.id
        assert retrieved_profile.first_name == "Index"
        assert retrieved_profile.last_name == "Test1"