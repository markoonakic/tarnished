"""Upgrade populated 0.2 data without merging owners or losing legacy fields."""

from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config


@pytest.mark.parametrize("db_engine", ["20261008_language"], indirect=True)
async def test_populated_workspace_upgrade(db_engine):
    async with db_engine.connect() as connection:

        def populate_and_upgrade(conn):
            metadata = sa.MetaData()
            metadata.reflect(conn)
            now = datetime(2026, 1, 1, tzinfo=UTC)
            users, statuses, apps, leads, profiles = [
                metadata.tables[name]
                for name in (
                    "users",
                    "application_statuses",
                    "applications",
                    "job_leads",
                    "user_profiles",
                )
            ]
            for user_id in ("one", "two"):
                conn.execute(
                    users.insert().values(
                        id=user_id,
                        email=f"{user_id}@example.com",
                        password_hash="not-used",
                        is_admin=False,
                        is_active=True,
                        created_at=now,
                    )
                )
                conn.execute(
                    profiles.insert().values(
                        id=f"profile-{user_id}",
                        user_id=user_id,
                        skills=["Python"],
                        work_history=[{"title": "Engineer", "legacy_unknown_key": 17}],
                        education=["legacy string"],
                    )
                )
            conn.execute(
                statuses.insert().values(
                    id="applied",
                    name="Applied",
                    normalized_name="applied",
                    meaning="applied",
                    is_default=True,
                    color="#123456",
                    order=0,
                )
            )
            for user_id in ("one", "two"):
                conn.execute(
                    leads.insert().values(
                        id=f"lead-{user_id}",
                        user_id=user_id,
                        url=f"https://example.org/{user_id}",
                        title="Engineer",
                        company=" North ",
                        recruiter_name="Mira",
                        status="extracted",
                        requirements_must_have=[],
                        requirements_nice_to_have=[],
                        skills=[],
                        scraped_at=now,
                    )
                )
                conn.execute(
                    apps.insert().values(
                        id=f"app-{user_id}",
                        user_id=user_id,
                        job_lead_id=f"lead-{user_id}",
                        company="North",
                        job_title="Engineer",
                        status_id="applied",
                        applied_at=date(2026, 1, 1),
                        created_at=now,
                        updated_at=now,
                        recruiter_name="Mira",
                        requirements_must_have=[],
                        requirements_nice_to_have=[],
                    )
                )
                conn.execute(
                    leads.update()
                    .where(leads.c.id == f"lead-{user_id}")
                    .values(converted_to_application_id=f"app-{user_id}")
                )
            config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
            config.attributes["connection"] = conn
            command.upgrade(config, "head")
            migrated = sa.MetaData()
            migrated.reflect(conn)
            assert (
                conn.scalar(
                    sa.select(sa.func.count()).select_from(migrated.tables["companies"])
                )
                == 2
            )
            assert (
                conn.scalar(
                    sa.select(sa.func.count()).select_from(migrated.tables["contacts"])
                )
                == 2
            )
            assert (
                conn.scalar(
                    sa.select(sa.func.count()).select_from(
                        migrated.tables["application_contacts"]
                    )
                )
                == 2
            )
            for user_id in ("one", "two"):
                assert (
                    conn.scalar(
                        sa.select(migrated.tables["users"].c.approval_pending).where(
                            migrated.tables["users"].c.id == user_id
                        )
                    )
                    is False
                )
                app = (
                    conn.execute(
                        sa.select(migrated.tables["applications"]).where(
                            migrated.tables["applications"].c.id == f"app-{user_id}"
                        )
                    )
                    .mappings()
                    .one()
                )
                lead = (
                    conn.execute(
                        sa.select(migrated.tables["job_leads"]).where(
                            migrated.tables["job_leads"].c.id == f"lead-{user_id}"
                        )
                    )
                    .mappings()
                    .one()
                )
                assert app["company_id"] == lead["company_id"]
                assert app["recruiter_contact_id"] == lead["recruiter_contact_id"]
                assert lead["company"] == " North "
                profile = (
                    conn.execute(
                        sa.select(migrated.tables["user_profiles"]).where(
                            migrated.tables["user_profiles"].c.user_id == user_id
                        )
                    )
                    .mappings()
                    .one()
                )
                assert UUID(profile["skill_items"][0]["id"])
                assert profile["work_history"][0]["legacy_unknown_key"] == 17
                assert profile["education"][0]["legacy_value"] == "legacy string"
                assert profile["education"][0]["needs_repair"]
            if conn.dialect.name == "sqlite":
                assert conn.scalar(sa.text("PRAGMA foreign_keys")) == 1
                assert not conn.execute(sa.text("PRAGMA foreign_key_check")).all()

        await connection.run_sync(populate_and_upgrade)
        await connection.commit()
