"""Lead capture upgrade preserves existing evidence and record links."""

from datetime import UTC, date, datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from tests.test_evidence_migrations import migration_config, populate_prior_schema


@pytest.mark.parametrize("db_engine", ["20260413_application_evidence"], indirect=True)
async def test_lead_capture_populated_forward_migration(db_engine):
    async with db_engine.begin() as connection:

        def upgrade(sync_connection):
            metadata = sa.MetaData()
            metadata.reflect(sync_connection)
            now = datetime(2026, 1, 1, tzinfo=UTC)
            sync_connection.execute(
                metadata.tables["users"]
                .insert()
                .values(
                    id="owner",
                    email="migration-capture@synthetic.test",
                    password_hash="unused",
                    is_admin=False,
                    is_active=True,
                    created_at=now,
                )
            )
            sync_connection.execute(
                metadata.tables["application_statuses"]
                .insert()
                .values(
                    id="status",
                    name="Applied",
                    normalized_name="applied",
                    meaning="applied",
                    user_id="owner",
                    color="#123456",
                    order=0,
                    is_default=False,
                )
            )
            sync_connection.execute(
                metadata.tables["job_leads"]
                .insert()
                .values(
                    id="lead",
                    user_id="owner",
                    url="https://jobs.example/prior",
                    status="converted",
                    title="Prior role",
                    company="Prior company",
                    skills=[],
                    requirements_must_have=[],
                    requirements_nice_to_have=[],
                    scraped_at=now,
                )
            )
            sync_connection.execute(
                metadata.tables["applications"]
                .insert()
                .values(
                    id="application",
                    user_id="owner",
                    company="Prior company",
                    job_title="Prior role",
                    job_lead_id="lead",
                    status_id="status",
                    applied_at=date(2026, 1, 1),
                    created_at=now,
                    updated_at=now,
                    requirements_must_have=[],
                    requirements_nice_to_have=[],
                    status_meaning="applied",
                    status_meaning_provenance="recorded",
                    response_state="not_recorded",
                )
            )
            sync_connection.execute(
                metadata.tables["job_leads"]
                .update()
                .values(converted_to_application_id="application")
            )
            sync_connection.execute(
                metadata.tables["application_status_history"]
                .insert()
                .values(
                    id="history",
                    application_id="application",
                    to_status_id="status",
                    changed_at=now,
                    to_meaning="applied",
                    to_meaning_provenance="recorded",
                    time_provenance="recorded",
                )
            )
            before = {
                name: list(
                    sync_connection.execute(sa.select(metadata.tables[name])).mappings()
                )
                for name in ["job_leads", "applications", "application_status_history"]
            }
            config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
            config.attributes["connection"] = sync_connection
            command.upgrade(config, "head")
            for name, rows in before.items():
                assert (
                    list(
                        sync_connection.execute(
                            sa.select(metadata.tables[name])
                        ).mappings()
                    )
                    == rows
                )
            row = sync_connection.execute(
                sa.text(
                    "SELECT source_text, source_truncated, content_warning, revision, manual_fields, processing_started_at FROM job_leads"
                )
            ).one()
            assert (
                row.source_text is None
                and not row.source_truncated
                and row.revision == 0
            )
            assert row.manual_fields in ([], "[]") and row.processing_started_at is None
            if sync_connection.dialect.name == "sqlite":
                assert sync_connection.scalar(sa.text("PRAGMA foreign_keys")) == 1
                assert not sync_connection.execute(
                    sa.text("PRAGMA foreign_key_check")
                ).all()

        await connection.run_sync(upgrade)


@pytest.mark.parametrize("db_engine", ["20260414_lead_capture"], indirect=True)
async def test_lead_capture_migration_refuses_destructive_downgrade(db_engine):
    async with db_engine.begin() as connection:

        def populate(sync_connection):
            populate_prior_schema(sync_connection)
            metadata = sa.MetaData()
            metadata.reflect(sync_connection)
            sync_connection.execute(
                metadata.tables["job_leads"]
                .insert()
                .values(
                    id="retained-lead",
                    user_id="synthetic-owner",
                    url="https://jobs.example/retained",
                    status="pending",
                    skills=[],
                    requirements_must_have=[],
                    requirements_nice_to_have=[],
                    scraped_at=datetime(2026, 1, 1, tzinfo=UTC),
                    source_text="Retained synthetic source",
                    source_truncated=True,
                    content_warning="Synthetic truncation warning",
                    revision=7,
                    manual_fields=["title"],
                    title="Manually corrected role",
                )
            )

        await connection.run_sync(populate)
    async with db_engine.begin() as connection:
        leads = sa.text("SELECT * FROM job_leads ORDER BY id")
        before = (await connection.execute(leads)).all()
        revision = await connection.scalar(
            sa.text("SELECT version_num FROM alembic_version")
        )
        assert revision == "20260414_lead_capture"
        with pytest.raises(
            RuntimeError,
            match="Lead capture downgrade would discard retained source and manual-correction intent",
        ):
            await connection.run_sync(
                lambda sync_connection: command.downgrade(
                    migration_config(sync_connection), "20260413_application_evidence"
                )
            )
        assert (await connection.execute(leads)).all() == before
        assert (
            await connection.scalar(sa.text("SELECT version_num FROM alembic_version"))
        ) == revision
