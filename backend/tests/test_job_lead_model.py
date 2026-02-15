"""Tests for JobLead model creation and database operations.

Task 8.1: Test JobLead model creation with sample data
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import JobLead, User


@pytest.fixture
async def test_user_for_job_lead(db: AsyncSession) -> User:
    """Create a test user for job lead tests."""
    user = User(
        email="joblead_test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestJobLeadModelCreation:
    """Test JobLead model creation with sample data."""

    async def test_create_job_lead_with_required_fields(
        self, db: AsyncSession, test_user_for_job_lead: User
    ):
        """Test creating a JobLead with only required fields."""
        job_lead = JobLead(
            user_id=test_user_for_job_lead.id,
            url="https://example.com/job/123",
            status="extracted",
        )
        db.add(job_lead)
        await db.commit()
        await db.refresh(job_lead)

        # Verify the job lead was saved correctly
        assert job_lead.id is not None
        assert job_lead.user_id == test_user_for_job_lead.id
        assert job_lead.url == "https://example.com/job/123"
        assert job_lead.status == "extracted"
        assert job_lead.scraped_at is not None

    async def test_create_job_lead_with_sample_data(
        self, db: AsyncSession, test_user_for_job_lead: User
    ):
        """Test creating a JobLead with full sample data as per task description."""
        sample_data = {
            "user_id": test_user_for_job_lead.id,
            "url": "https://example.com/job/123",
            "status": "extracted",
            "title": "Senior Software Engineer",
            "company": "Tech Corp",
            "description": "Great job opportunity",
            "location": "San Francisco, CA",
            "salary_min": 150000,
            "salary_max": 200000,
            "salary_currency": "USD",
        }

        job_lead = JobLead(**sample_data)
        db.add(job_lead)
        await db.commit()
        await db.refresh(job_lead)

        # Verify all fields were saved correctly
        assert job_lead.id is not None
        assert job_lead.user_id == test_user_for_job_lead.id
        assert job_lead.url == "https://example.com/job/123"
        assert job_lead.status == "extracted"
        assert job_lead.title == "Senior Software Engineer"
        assert job_lead.company == "Tech Corp"
        assert job_lead.description == "Great job opportunity"
        assert job_lead.location == "San Francisco, CA"
        assert job_lead.salary_min == 150000
        assert job_lead.salary_max == 200000
        assert job_lead.salary_currency == "USD"

    async def test_create_job_lead_with_people_intelligence(
        self, db: AsyncSession, test_user_for_job_lead: User
    ):
        """Test creating a JobLead with recruiter/HR information."""
        job_lead = JobLead(
            user_id=test_user_for_job_lead.id,
            url="https://linkedin.com/jobs/view/456",
            status="pending",
            title="Staff Engineer",
            company="Big Tech Inc",
            recruiter_name="Jane Doe",
            recruiter_title="Senior Recruiter",
            recruiter_linkedin_url="https://linkedin.com/in/janedoe",
        )
        db.add(job_lead)
        await db.commit()
        await db.refresh(job_lead)

        assert job_lead.recruiter_name == "Jane Doe"
        assert job_lead.recruiter_title == "Senior Recruiter"
        assert job_lead.recruiter_linkedin_url == "https://linkedin.com/in/janedoe"

    async def test_create_job_lead_with_requirements(
        self, db: AsyncSession, test_user_for_job_lead: User
    ):
        """Test creating a JobLead with requirements and skills."""
        job_lead = JobLead(
            user_id=test_user_for_job_lead.id,
            url="https://indeed.com/job/789",
            status="extracted",
            title="Backend Developer",
            company="Startup Co",
            requirements_must_have=["Python", "FastAPI", "PostgreSQL"],
            requirements_nice_to_have=["Docker", "Kubernetes"],
            skills=["Python", "SQL", "API Design"],
            years_experience_min=3,
            years_experience_max=5,
        )
        db.add(job_lead)
        await db.commit()
        await db.refresh(job_lead)

        assert job_lead.requirements_must_have == ["Python", "FastAPI", "PostgreSQL"]
        assert job_lead.requirements_nice_to_have == ["Docker", "Kubernetes"]
        assert job_lead.skills == ["Python", "SQL", "API Design"]
        assert job_lead.years_experience_min == 3
        assert job_lead.years_experience_max == 5

    async def test_create_job_lead_with_default_values(
        self, db: AsyncSession, test_user_for_job_lead: User
    ):
        """Test that default values are set correctly."""
        job_lead = JobLead(
            user_id=test_user_for_job_lead.id,
            url="https://example.com/job/default-test",
        )
        db.add(job_lead)
        await db.commit()
        await db.refresh(job_lead)

        # Check defaults
        assert job_lead.status == "pending"  # Default status
        assert job_lead.requirements_must_have == []  # Default empty list
        assert job_lead.requirements_nice_to_have == []  # Default empty list
        assert job_lead.skills == []  # Default empty list
        assert job_lead.scraped_at is not None  # Auto-set

    async def test_retrieve_job_lead_from_database(
        self, db: AsyncSession, test_user_for_job_lead: User
    ):
        """Test retrieving a JobLead from the database after creation."""
        # Create and save a job lead
        job_lead = JobLead(
            user_id=test_user_for_job_lead.id,
            url="https://example.com/job/retrieve-test",
            status="converted",
            title="Full Stack Developer",
            company="Web Corp",
        )
        db.add(job_lead)
        await db.commit()
        await db.refresh(job_lead)
        job_lead_id = job_lead.id

        # Clear the session to ensure we're reading from the database
        db.expunge(job_lead)

        # Retrieve the job lead
        result = await db.execute(
            select(JobLead).where(JobLead.id == job_lead_id)
        )
        retrieved_lead = result.scalar_one_or_none()

        assert retrieved_lead is not None
        assert retrieved_lead.id == job_lead_id
        assert retrieved_lead.url == "https://example.com/job/retrieve-test"
        assert retrieved_lead.title == "Full Stack Developer"
        assert retrieved_lead.company == "Web Corp"

    async def test_job_lead_user_relationship(
        self, db: AsyncSession, test_user_for_job_lead: User
    ):
        """Test the relationship between JobLead and User."""
        job_lead = JobLead(
            user_id=test_user_for_job_lead.id,
            url="https://example.com/job/relationship-test",
        )
        db.add(job_lead)
        await db.commit()
        await db.refresh(job_lead)

        # Test the relationship
        assert job_lead.user is not None
        assert job_lead.user.id == test_user_for_job_lead.id
        assert job_lead.user.email == "joblead_test@example.com"

    async def test_job_lead_repr(
        self, db: AsyncSession, test_user_for_job_lead: User
    ):
        """Test the __repr__ method of JobLead."""
        job_lead = JobLead(
            user_id=test_user_for_job_lead.id,
            url="https://example.com/job/repr-test",
            status="error",
            title="DevOps Engineer",
            company="Cloud Systems",
        )
        db.add(job_lead)
        await db.commit()

        repr_str = repr(job_lead)
        assert "JobLead" in repr_str
        assert job_lead.id in repr_str
        assert "error" in repr_str
        assert "DevOps Engineer" in repr_str
        assert "Cloud Systems" in repr_str
