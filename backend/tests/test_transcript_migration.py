"""Populated prior-schema upgrade and explicit refusal to lose transcript evidence."""

from datetime import UTC, datetime

import pytest
import sqlalchemy as sa
from alembic import command
from tests.test_evidence_migrations import migration_config, populate_prior_schema

from app.services.transcripts import parse_transcript


@pytest.mark.parametrize("db_engine", ["20260414_lead_capture"], indirect=True)
async def test_current_transcript_populated_upgrade_and_refused_downgrade(db_engine):
    async with db_engine.begin() as connection:

        def migrate(sync):
            populate_prior_schema(sync)
            metadata = sa.MetaData()
            metadata.reflect(sync)
            sync.execute(
                metadata.tables["round_types"]
                .insert()
                .values(
                    id="type",
                    name="Interview",
                    normalized_name="interview",
                    is_default=True,
                )
            )
            sync.execute(
                metadata.tables["rounds"]
                .insert()
                .values(
                    id="round",
                    application_id="with-history",
                    round_type_id="type",
                    transcript_path="original/cas",
                    transcript_summary="retained summary",
                    created_at=datetime(2026, 1, 1, tzinfo=UTC),
                )
            )
            before = sync.execute(sa.text("SELECT * FROM rounds")).mappings().one()
            config = migration_config(sync)
            command.upgrade(config, "20260415_current_transcript")
            after = sync.execute(sa.text("SELECT * FROM rounds")).mappings().one()
            assert all(after[key] == value for key, value in before.items())
            assert (
                after["transcript_generation"] == 0
                and after["current_transcript"] is None
            )
            command.downgrade(config, "20260414_lead_capture")
            command.upgrade(config, "20260415_current_transcript")
            metadata = sa.MetaData()
            metadata.reflect(sync)
            transcript = parse_transcript(
                b"persisted evidence", "txt", "paste"
            ).model_dump()
            sync.execute(
                metadata.tables["rounds"]
                .update()
                .values(current_transcript=transcript, transcript_generation=1)
            )
            for content in (transcript, None):
                sync.execute(
                    metadata.tables["rounds"]
                    .update()
                    .values(current_transcript=content)
                )
                with pytest.raises(
                    RuntimeError, match="transcript content or generation"
                ):
                    command.downgrade(config, "20260414_lead_capture")
                assert (
                    sync.scalar(sa.text("SELECT version_num FROM alembic_version"))
                    == "20260415_current_transcript"
                )
                assert (
                    sync.scalar(sa.text("SELECT transcript_generation FROM rounds"))
                    == 1
                )

        await connection.run_sync(migrate)
