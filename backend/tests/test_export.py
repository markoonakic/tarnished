"""Tests for export functionality with SQLite and PostgreSQL compatibility.

These tests verify that the export functionality works correctly with both
SQLite and PostgreSQL databases, ensuring data integrity and completeness.
"""

import csv
import io
import json
from datetime import date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    MediaType,
    Round,
    RoundMedia,
    RoundType,
    User,
)


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    """Create a test user with admin privileges."""
    user = User(
        email="test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=True,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def test_statuses(db: AsyncSession, test_user: User) -> list[ApplicationStatus]:
    """Create test application statuses."""
    statuses = [
        ApplicationStatus(name="Wishlist", color="#83a598", is_default=True, user_id=test_user.id),
        ApplicationStatus(name="Applied", color="#8ec07c", is_default=True, user_id=test_user.id),
        ApplicationStatus(name="Interview", color="#fe8019", is_default=True, user_id=test_user.id),
        ApplicationStatus(name="Offer", color="#fabd2f", is_default=True, user_id=test_user.id),
        ApplicationStatus(name="Rejected", color="#fb4934", is_default=True, user_id=test_user.id),
    ]
    for status in statuses:
        db.add(status)
    await db.commit()
    for status in statuses:
        await db.refresh(status)
    return statuses


@pytest.fixture
async def test_round_types(db: AsyncSession, test_user: User) -> list[RoundType]:
    """Create test round types."""
    round_types = [
        RoundType(name="Phone Screen", is_default=True, user_id=test_user.id),
        RoundType(name="Technical Interview", is_default=True, user_id=test_user.id),
        RoundType(name="Onsite", is_default=True, user_id=test_user.id),
    ]
    for round_type in round_types:
        db.add(round_type)
    await db.commit()
    for round_type in round_types:
        await db.refresh(round_type)
    return round_types


@pytest.fixture
async def test_applications(
    db: AsyncSession,
    test_user: User,
    test_statuses: list[ApplicationStatus],
    test_round_types: list[RoundType],
) -> list[Application]:
    """Create test applications with various states."""
    applications = []

    # Application 1: Simple application with no rounds or status history
    app1 = Application(
        user_id=test_user.id,
        company="Tech Corp",
        job_title="Software Engineer",
        job_description="Build great software",
        job_url="https://techcorp.com/jobs/1",
        status_id=test_statuses[1].id,  # Applied
        cv_path="/cvs/resume1.pdf",
        applied_at=date(2024, 1, 15),
    )
    db.add(app1)
    applications.append(app1)

    # Application 2: Application with rounds but no status history
    app2 = Application(
        user_id=test_user.id,
        company="Startup Inc",
        job_title="Full Stack Developer",
        job_description="Join our fast-growing team",
        job_url="https://startupinc.com/careers/dev",
        status_id=test_statuses[2].id,  # Interview
        cv_path="/cvs/resume2.pdf",
        applied_at=date(2024, 1, 20),
    )
    db.add(app2)
    await db.flush()  # Flush to get app2.id
    applications.append(app2)

    # Add rounds to app2
    round1 = Round(
        application_id=app2.id,
        round_type_id=test_round_types[0].id,  # Phone Screen
        scheduled_at=datetime(2024, 1, 22, 10, 0),
        completed_at=datetime(2024, 1, 22, 10, 30),
        outcome="Passed",
        notes_summary="Great conversation about React",
    )
    db.add(round1)
    await db.flush()

    # Add media to round1
    media1 = RoundMedia(
        round_id=round1.id,
        file_path="/media/interview1.mp4",
        media_type=MediaType.VIDEO,
    )
    db.add(media1)

    round2 = Round(
        application_id=app2.id,
        round_type_id=test_round_types[1].id,  # Technical Interview
        scheduled_at=datetime(2024, 1, 25, 14, 0),
        completed_at=None,
        outcome=None,
        notes_summary="Coding challenge scheduled",
    )
    db.add(round2)

    # Application 3: Application with status history but no rounds
    app3 = Application(
        user_id=test_user.id,
        company="Big Tech Company",
        job_title="Senior Backend Engineer",
        job_description="Scale our systems",
        job_url="https://bigtech.com/jobs/backend",
        status_id=test_statuses[3].id,  # Offer
        cv_path="/cvs/resume3.pdf",
        applied_at=date(2024, 1, 10),
    )
    db.add(app3)
    await db.flush()  # Flush to get app3.id
    applications.append(app3)

    # Add status history to app3
    history1 = ApplicationStatusHistory(
        application_id=app3.id,
        from_status_id=None,
        to_status_id=test_statuses[0].id,  # Wishlist
        changed_at=datetime(2024, 1, 8, 9, 0),
        note="Added to wishlist",
    )
    db.add(history1)

    history2 = ApplicationStatusHistory(
        application_id=app3.id,
        from_status_id=test_statuses[0].id,  # Wishlist
        to_status_id=test_statuses[1].id,  # Applied
        changed_at=datetime(2024, 1, 10, 10, 30),
        note="Applied through portal",
    )
    db.add(history2)

    history3 = ApplicationStatusHistory(
        application_id=app3.id,
        from_status_id=test_statuses[1].id,  # Applied
        to_status_id=test_statuses[2].id,  # Interview
        changed_at=datetime(2024, 1, 15, 14, 0),
        note="Phone screen went well",
    )
    db.add(history3)

    history4 = ApplicationStatusHistory(
        application_id=app3.id,
        from_status_id=test_statuses[2].id,  # Interview
        to_status_id=test_statuses[3].id,  # Offer
        changed_at=datetime(2024, 1, 25, 16, 0),
        note="Received offer!",
    )
    db.add(history4)

    # Application 4: Application with both rounds and status history
    app4 = Application(
        user_id=test_user.id,
        company="Amazing Startup",
        job_title="Frontend Developer",
        job_description="Build beautiful UIs",
        job_url="https://amazingstartup.com/jobs/frontend",
        status_id=test_statuses[4].id,  # Rejected
        cv_path="/cvs/resume4.pdf",
        applied_at=date(2024, 1, 5),
    )
    db.add(app4)
    await db.flush()  # Flush to get app4.id
    applications.append(app4)

    # Add status history to app4
    history5 = ApplicationStatusHistory(
        application_id=app4.id,
        from_status_id=None,
        to_status_id=test_statuses[1].id,  # Applied
        changed_at=datetime(2024, 1, 5, 11, 0),
        note="Applied",
    )
    db.add(history5)

    history6 = ApplicationStatusHistory(
        application_id=app4.id,
        from_status_id=test_statuses[1].id,  # Applied
        to_status_id=test_statuses[4].id,  # Rejected
        changed_at=datetime(2024, 1, 18, 9, 0),
        note="Not moving forward",
    )
    db.add(history6)

    # Add rounds to app4
    round3 = Round(
        application_id=app4.id,
        round_type_id=test_round_types[0].id,  # Phone Screen
        scheduled_at=datetime(2024, 1, 10, 11, 0),
        completed_at=datetime(2024, 1, 10, 11, 45),
        outcome="Rejected",
        notes_summary="Didn't have enough React experience",
    )
    db.add(round3)
    await db.flush()

    # Add multiple media files to round3
    media2 = RoundMedia(
        round_id=round3.id,
        file_path="/media/phone_screen.mp4",
        media_type=MediaType.VIDEO,
    )
    db.add(media2)

    media3 = RoundMedia(
        round_id=round3.id,
        file_path="/media/phone_screen_audio.mp3",
        media_type=MediaType.AUDIO,
    )
    db.add(media3)

    await db.commit()
    for app in applications:
        await db.refresh(app)
    return applications


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    """Create authentication headers for test user."""
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


class TestJSONExport:
    """Test JSON export functionality."""

    async def test_json_export_includes_all_data(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test JSON export includes all related data."""
        response = await client.get(
            "/api/export/json",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()

        # Verify structure
        assert "user" in data
        assert "applications" in data

        # Verify user data
        assert data["user"]["email"] == "test@example.com"

        # Verify we have all applications
        assert len(data["applications"]) == 4

        # Verify each application has all relationships
        for app in data["applications"]:
            assert "status" in app
            assert "status_history" in app
            assert "rounds" in app

            # Check each round has round_type and media
            for round in app["rounds"]:
                assert "type" in round
                assert "media" in round

    async def test_json_export_simple_application(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test JSON export for application with no rounds or status history."""
        response = await client.get("/api/export/json", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        app1_data = next((app for app in data["applications"] if app["company"] == "Tech Corp"), None)

        assert app1_data is not None
        assert app1_data["job_title"] == "Software Engineer"
        assert app1_data["status"] == "Applied"
        assert len(app1_data["rounds"]) == 0
        assert len(app1_data["status_history"]) == 0
        assert app1_data["cv_path"] == "/cvs/resume1.pdf"

    async def test_json_export_application_with_rounds(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test JSON export for application with rounds."""
        response = await client.get("/api/export/json", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        app2_data = next((app for app in data["applications"] if app["company"] == "Startup Inc"), None)

        assert app2_data is not None
        assert len(app2_data["rounds"]) == 2

        # Check first round
        round1 = app2_data["rounds"][0]
        assert round1["type"] == "Phone Screen"
        assert round1["outcome"] == "Passed"
        assert round1["notes_summary"] == "Great conversation about React"
        assert len(round1["media"]) == 1
        assert round1["media"][0]["type"] == "video"
        assert round1["media"][0]["path"] == "/media/interview1.mp4"

        # Check second round
        round2 = app2_data["rounds"][1]
        assert round2["type"] == "Technical Interview"
        assert round2["outcome"] is None
        assert round2["completed_at"] is None
        assert len(round2["media"]) == 0

    async def test_json_export_status_history(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test JSON export includes status history."""
        response = await client.get("/api/export/json", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        app3_data = next((app for app in data["applications"] if app["company"] == "Big Tech Company"), None)

        assert app3_data is not None
        assert len(app3_data["status_history"]) == 4

        # Check status history entries (ordered by desc(changed_at), most recent first)
        history = app3_data["status_history"]
        assert history[0]["from_status"] == "Interview"
        assert history[0]["to_status"] == "Offer"
        assert history[0]["note"] == "Received offer!"

        assert history[1]["from_status"] == "Applied"
        assert history[1]["to_status"] == "Interview"
        assert history[1]["note"] == "Phone screen went well"

        assert history[3]["from_status"] is None
        assert history[3]["to_status"] == "Wishlist"
        assert history[3]["note"] == "Added to wishlist"

    async def test_json_export_rounds_and_status_history(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test JSON export for application with both rounds and status history."""
        response = await client.get("/api/export/json", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        app4_data = next((app for app in data["applications"] if app["company"] == "Amazing Startup"), None)

        assert app4_data is not None
        assert len(app4_data["status_history"]) == 2
        assert len(app4_data["rounds"]) == 1

        # Check round with multiple media files
        round_data = app4_data["rounds"][0]
        assert round_data["type"] == "Phone Screen"
        assert round_data["outcome"] == "Rejected"
        assert len(round_data["media"]) == 2
        assert round_data["media"][0]["type"] == "video"
        assert round_data["media"][1]["type"] == "audio"


class TestCSVExport:
    """Test CSV export functionality."""

    async def test_csv_export_includes_rounds(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test CSV export includes round information."""
        response = await client.get(
            "/api/export/csv",
            headers=auth_headers,
        )
        assert response.status_code == 200

        content = response.text
        lines = content.split("\n")

        # Verify header includes round columns
        assert "Round Type" in lines[0]
        assert "Round Status" in lines[0]
        assert "Round Outcome" in lines[0]
        assert "Round Notes" in lines[0]
        assert "Round Media" in lines[0]

        # Verify data rows have round data
        assert len(lines) > 1  # Has data rows

    async def test_csv_export_simple_application(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test CSV export for application with no rounds or status history."""
        response = await client.get("/api/export/csv", headers=auth_headers)
        assert response.status_code == 200

        content = response.text
        lines = [line for line in content.split("\n") if line.strip()]

        # Find the row for Tech Corp
        tech_corp_row = next((line for line in lines if "Tech Corp" in line), None)
        assert tech_corp_row is not None

        reader = csv.reader(io.StringIO(tech_corp_row))
        row = next(reader)

        assert row[0] == "Tech Corp"  # Company
        assert row[1] == "Software Engineer"  # Job Title
        assert row[2] == "Applied"  # Status

    async def test_csv_export_application_with_rounds(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test CSV export for application with rounds."""
        response = await client.get("/api/export/csv", headers=auth_headers)
        assert response.status_code == 200

        content = response.text

        # Check that the CSV contains Phone Screen round data for Startup Inc
        assert "Startup Inc" in content
        assert "Phone Screen" in content

        # Find the line with both Startup Inc and Phone Screen
        lines = content.split("\n")
        phone_screen_line = next((line for line in lines if "Startup Inc" in line and "Phone Screen" in line), None)
        assert phone_screen_line is not None, "No line found with both 'Startup Inc' and 'Phone Screen'"

        # Verify the line contains expected round information
        assert "Completed" in phone_screen_line
        assert "Passed" in phone_screen_line

    async def test_csv_export_status_history(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test CSV export includes status history."""
        response = await client.get("/api/export/csv", headers=auth_headers)
        assert response.status_code == 200

        content = response.text

        # Check that the CSV contains status history data for Big Tech Company
        assert "Big Tech Company" in content

        # The CSV should contain status transitions
        assert "Wishlist -> Applied" in content or "Applied -> Interview" in content or "Interview -> Offer" in content

        # Find a line with Big Tech Company and status history
        lines = content.split("\n")
        status_line = next((line for line in lines if "Big Tech Company" in line and ("->" in line)), None)
        assert status_line is not None, "No line found with 'Big Tech Company' and status history"

    async def test_csv_export_rounds_and_status_history(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test CSV export for application with both rounds and status history."""
        response = await client.get("/api/export/csv", headers=auth_headers)
        assert response.status_code == 200

        content = response.text
        lines = [line for line in content.split("\n") if line.strip()]

        # Find rows for Amazing Startup
        amazing_rows = [line for line in lines if "Amazing Startup" in line]
        # Should have 2 status history entries + 1 round = 3 rows
        # But the first status history entry is paired with the round
        assert len(amazing_rows) >= 2

    async def test_csv_export_multiple_media_files(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test CSV export handles multiple media files correctly."""
        response = await client.get("/api/export/csv", headers=auth_headers)
        assert response.status_code == 200

        content = response.text

        # Check that the CSV contains media file data for Amazing Startup
        assert "Amazing Startup" in content
        assert "phone_screen.mp4" in content
        assert "phone_screen_audio.mp3" in content

        # Find the line with both Amazing Startup and phone_screen.mp4
        lines = content.split("\n")
        media_line = next((line for line in lines if "Amazing Startup" in line and "phone_screen.mp4" in line), None)
        assert media_line is not None, "No line found with both 'Amazing Startup' and 'phone_screen.mp4'"

        # Verify the line contains both media files
        assert "phone_screen_audio.mp3" in media_line


class TestDataConsistency:
    """Test data consistency between JSON and CSV exports."""

    async def test_export_data_consistency(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test JSON and CSV exports contain the same core data."""
        json_response = await client.get("/api/export/json", headers=auth_headers)
        csv_response = await client.get("/api/export/csv", headers=auth_headers)

        assert json_response.status_code == 200
        assert csv_response.status_code == 200

        json_data = json_response.json()
        csv_data = csv_response.text

        # Both should have the same number of applications
        json_app_count = len(json_data.get("applications", []))

        # Count CSV unique applications (by company name)
        csv_lines = csv_data.split("\n")
        csv_companies = set()
        for line in csv_lines[1:]:  # Skip header
            if line.strip():
                try:
                    row = next(csv.reader(io.StringIO(line)))
                    if row and len(row) > 0:  # Ensure row is not empty
                        csv_companies.add(row[0])
                except StopIteration:
                    continue

        csv_app_count = len(csv_companies)

        # Both should have exactly 4 applications
        assert json_app_count == 4, f"JSON has {json_app_count} applications, expected 4"
        assert csv_app_count == 4, f"CSV has {csv_app_count} unique companies, expected 4"

    async def test_json_csv_application_count_match(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that both exports have the same application count."""
        json_response = await client.get("/api/export/json", headers=auth_headers)
        csv_response = await client.get("/api/export/csv", headers=auth_headers)

        json_data = json_response.json()
        csv_data = csv_response.text

        json_app_count = len(json_data.get("applications", []))

        # Count CSV data rows (not including header)
        csv_lines = [line for line in csv_data.split("\n") if line.strip()]
        csv_row_count = len(csv_lines) - 1  # Subtract header

        # CSV may have more rows due to multiple rounds/status history per application
        # but should have at least as many rows as applications
        assert csv_row_count >= json_app_count

    async def test_both_exports_include_all_companies(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_applications: list[Application],
    ):
        """Test that both exports include all companies."""
        json_response = await client.get("/api/export/json", headers=auth_headers)
        csv_response = await client.get("/api/export/csv", headers=auth_headers)

        json_data = json_response.json()
        csv_data = csv_response.text

        # Extract companies from JSON
        json_companies = {app["company"] for app in json_data.get("applications", [])}

        # Extract companies from CSV
        csv_lines = csv_data.split("\n")
        csv_companies = set()
        for line in csv_lines[1:]:  # Skip header
            if line.strip():
                try:
                    row = next(csv.reader(io.StringIO(line)))
                    if row and len(row) > 0:
                        csv_companies.add(row[0])
                except StopIteration:
                    continue

        expected_companies = {"Tech Corp", "Startup Inc", "Big Tech Company", "Amazing Startup"}

        assert json_companies == expected_companies, f"JSON companies: {json_companies}"
        assert csv_companies == expected_companies, f"CSV companies: {csv_companies}"


class TestExportAuthentication:
    """Test export authentication and authorization."""

    async def test_export_requires_authentication(
        self,
        client: AsyncClient,
    ):
        """Test that export endpoints require authentication."""
        json_response = await client.get("/api/export/json")
        csv_response = await client.get("/api/export/csv")

        assert json_response.status_code == 401
        assert csv_response.status_code == 401

    async def test_export_with_valid_token(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that export works with valid authentication."""
        json_response = await client.get("/api/export/json", headers=auth_headers)
        csv_response = await client.get("/api/export/csv", headers=auth_headers)

        assert json_response.status_code == 200
        assert csv_response.status_code == 200


class TestExportHeaders:
    """Test export response headers."""

    async def test_json_export_content_disposition(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test JSON export has correct content disposition header."""
        response = await client.get("/api/export/json", headers=auth_headers)

        assert response.status_code == 200
        assert "content-disposition" in response.headers
        assert "attachment" in response.headers["content-disposition"]
        assert "tarnished-export.json" in response.headers["content-disposition"]

    async def test_csv_export_content_disposition(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test CSV export has correct content disposition header."""
        response = await client.get("/api/export/csv", headers=auth_headers)

        assert response.status_code == 200
        assert "content-disposition" in response.headers
        assert "attachment" in response.headers["content-disposition"]
        assert "tarnished-export.csv" in response.headers["content-disposition"]

    async def test_json_export_content_type(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test JSON export has correct content type."""
        response = await client.get("/api/export/json", headers=auth_headers)

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"

    async def test_csv_export_content_type(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test CSV export has correct content type."""
        response = await client.get("/api/export/csv", headers=auth_headers)

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"


class TestExportIncludesDefaults:
    """Test that export includes default statuses and round types."""

    async def test_json_export_includes_default_statuses(
        self,
        db: AsyncSession,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that JSON export includes default statuses (user_id=None)."""
        # Create a default status (user_id=None, is_default=True)
        default_status = ApplicationStatus(
            name="Default Status",
            color="#ff0000",
            is_default=True,
            user_id=None,
            order=999,
        )
        db.add(default_status)
        await db.commit()

        # Create a user-specific status
        user_status = ApplicationStatus(
            name="User Status",
            color="#00ff00",
            is_default=False,
            user_id=auth_headers["Authorization"].split(" ")[1].split("-")[0],  # Extract user ID from token
            order=1000,
        )
        # Note: We can't easily get the user ID from the token, so we'll skip this part
        # and just verify the default status is included

        response = await client.get("/api/export/json", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        status_names = [s["name"] for s in data.get("custom_statuses", [])]

        # Should include the default status
        assert "Default Status" in status_names, "Export should include default statuses with user_id=None"

    async def test_json_export_includes_default_round_types(
        self,
        db: AsyncSession,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that JSON export includes default round types (user_id=None)."""
        # Create a default round type (user_id=None, is_default=True)
        default_round_type = RoundType(
            name="Default Round",
            is_default=True,
            user_id=None,
        )
        db.add(default_round_type)
        await db.commit()

        response = await client.get("/api/export/json", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        round_type_names = [rt["name"] for rt in data.get("custom_round_types", [])]

        # Should include the default round type
        assert "Default Round" in round_type_names, "Export should include default round types with user_id=None"

    async def test_json_export_includes_both_default_and_user_entities(
        self,
        db: AsyncSession,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test that JSON export includes both default and user-specific entities."""
        # Create default status
        default_status = ApplicationStatus(
            name="System Default",
            color="#0000ff",
            is_default=True,
            user_id=None,
            order=1,
        )
        db.add(default_status)

        # Create user-specific status
        user_status = ApplicationStatus(
            name="User Custom",
            color="#00ff00",
            is_default=False,
            user_id=test_user.id,
            order=2,
        )
        db.add(user_status)

        # Create default round type
        default_round_type = RoundType(
            name="System Round",
            is_default=True,
            user_id=None,
        )
        db.add(default_round_type)

        # Create user-specific round type
        user_round_type = RoundType(
            name="User Round",
            is_default=False,
            user_id=test_user.id,
        )
        db.add(user_round_type)

        await db.commit()

        response = await client.get("/api/export/json", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        status_names = [s["name"] for s in data.get("custom_statuses", [])]
        round_type_names = [rt["name"] for rt in data.get("custom_round_types", [])]

        # Should include both default and user-specific entities
        assert "System Default" in status_names, "Export should include default statuses"
        assert "User Custom" in status_names, "Export should include user-specific statuses"
        assert "System Round" in round_type_names, "Export should include default round types"
        assert "User Round" in round_type_names, "Export should include user-specific round types"


class TestZIPExport:
    """Test ZIP export functionality."""

    async def test_zip_export_requires_auth(self, client: AsyncClient):
        """Test ZIP export requires authentication."""
        response = await client.get("/api/export/zip")
        assert response.status_code == 401

    async def test_zip_export_includes_data_json(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ):
        """Test ZIP export contains data.json file."""
        response = await client.get(
            "/api/export/zip",
            headers=auth_headers,
        )
        assert response.status_code == 200

        # Verify it's a valid ZIP
        assert response.headers["content-type"] == "application/zip"

        # Check ZIP contents
        import zipfile
        import io

        zip_bytes = await response.aread()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            assert "data.json" in zf.namelist()

            # Verify JSON structure
            data = json.loads(zf.read("data.json"))
            assert "user" in data
            assert "applications" in data

    async def test_zip_export_filename_includes_timestamp(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ):
        """Test ZIP filename has timestamp."""
        response = await client.get(
            "/api/export/zip",
            headers=auth_headers,
        )
        assert response.status_code == 200

        content_disposition = response.headers.get("content-disposition", "")
        assert "tarnished-export-" in content_disposition
        assert ".zip" in content_disposition
