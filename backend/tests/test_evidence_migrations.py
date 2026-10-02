"""Populated historical-schema upgrades, never an old deployment or real data."""

from datetime import UTC, date, datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.database import Base


def migration_config(connection):
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.attributes["connection"] = connection
    return config


def populate_prior_schema(connection):
    metadata = sa.MetaData()
    metadata.reflect(connection)
    timestamp_type = metadata.tables["users"].c.created_at.type
    assert isinstance(timestamp_type, sa.DateTime)
    now = datetime(2026, 1, 1, tzinfo=UTC if timestamp_type.timezone else None)
    connection.execute(
        metadata.tables["users"]
        .insert()
        .values(
            id="synthetic-owner",
            email="migration@synthetic.test",
            password_hash="unused",
            is_admin=False,
            is_active=True,
            created_at=now,
        )
    )
    for name in ["Applied", "Interviewing", "Rejected", "Withdrawn"]:
        values: dict = {
            "id": name,
            "name": name,
            "color": "#123456",
            "is_default": True,
            "user_id": None,
            "order": 0,
        }
        if "normalized_name" in metadata.tables["application_statuses"].c:
            values["normalized_name"] = name.lower()
        connection.execute(
            metadata.tables["application_statuses"].insert().values(**values)
        )
    for app_id, status in [("with-history", "Rejected"), ("no-history", "Withdrawn")]:
        values = {
            "id": app_id,
            "user_id": "synthetic-owner",
            "company": "Synthetic",
            "job_title": "Role",
            "status_id": status,
            "applied_at": date(2026, 1, 1),
            "created_at": now,
            "updated_at": now,
        }
        for field in ("requirements_must_have", "requirements_nice_to_have"):
            if field in metadata.tables["applications"].c:
                values[field] = []
        connection.execute(metadata.tables["applications"].insert().values(**values))
    connection.execute(
        metadata.tables["application_status_history"]
        .insert()
        .values(
            id="genuine-observation",
            application_id="with-history",
            from_status_id="Interviewing",
            to_status_id="Rejected",
            changed_at=now,
            note="Meaningful synthetic prior-schema observation; preserve exactly",
        )
    )


def history_content(connection):
    return list(
        connection.execute(
            sa.text(
                "SELECT id, application_id, from_status_id, to_status_id, changed_at, note FROM application_status_history ORDER BY id"
            )
        )
    )


@pytest.mark.parametrize("start", ["a5dc88e4b7b6", "20260412_account_sessions"])
async def test_populated_migrations_are_non_destructive(db_engine, start):
    async with db_engine.connect() as connection:
        # This is exclusively the shared fixture's labelled disposable database.
        if connection.dialect.name == "sqlite":
            await connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        await connection.run_sync(Base.metadata.drop_all)
        await connection.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
        await connection.commit()

        def run(sync_connection):
            config = migration_config(sync_connection)
            command.upgrade(config, start)
            populate_prior_schema(sync_connection)

        await connection.run_sync(run)
        await connection.commit()
        if connection.dialect.name == "sqlite":
            await connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            assert await connection.scalar(sa.text("PRAGMA foreign_keys")) == 1

        def run_upgrades(sync_connection):
            config = migration_config(sync_connection)
            before = history_content(sync_connection)
            if start == "a5dc88e4b7b6":
                command.upgrade(config, "823286b57444")
                assert history_content(sync_connection) == before
                command.downgrade(config, "a5dc88e4b7b6")
                assert history_content(sync_connection) == before
                command.upgrade(config, "50dd97924e9f")
                command.upgrade(config, "913e52a54449")
                assert history_content(sync_connection) == before
                command.downgrade(config, "50dd97924e9f")
                assert history_content(sync_connection) == before
                return
            command.upgrade(config, "head")
            assert history_content(sync_connection) == before
            row = sync_connection.execute(
                sa.text(
                    "SELECT from_meaning, to_meaning, from_meaning_provenance, to_meaning_provenance, time_provenance, is_gap FROM application_status_history"
                )
            ).one()
            assert row[:5] == (
                None,
                None,
                "legacy_unknown",
                "legacy_unknown",
                "legacy_unknown",
            )
            assert not row.is_gap
            assert (
                sync_connection.scalar(sa.text("SELECT COUNT(*) FROM applications"))
                == 2
            )
            assert (
                sync_connection.scalar(
                    sa.text(
                        "SELECT COUNT(*) FROM applications WHERE status_meaning = 'unknown' AND status_meaning_provenance = 'legacy_unknown' AND response_state = 'legacy_unknown'"
                    )
                )
                == 2
            )
            assert (
                sync_connection.scalar(
                    sa.text(
                        "SELECT meaning FROM application_statuses WHERE id = 'Rejected'"
                    )
                )
                == "rejected"
            )

        await connection.run_sync(run_upgrades)
        await connection.commit()
        if connection.dialect.name == "sqlite":
            assert not (
                await connection.exec_driver_sql("PRAGMA foreign_key_check")
            ).all()


@pytest.mark.parametrize("db_engine", ["fb5feec1a36e"], indirect=True)
async def test_nullable_requirement_columns_upgrade_with_existing_applications(
    db_engine,
):
    async with db_engine.connect() as connection:
        if connection.dialect.name == "sqlite":
            await connection.exec_driver_sql("PRAGMA foreign_keys=OFF")

        def upgrade(sync_connection):
            populate_prior_schema(sync_connection)
            sync_connection.execute(
                sa.text(
                    "UPDATE applications SET requirements_must_have = NULL, requirements_nice_to_have = NULL"
                )
            )
            command.upgrade(migration_config(sync_connection), "head")
            metadata = sa.MetaData()
            metadata.reflect(sync_connection)
            applications = metadata.tables["applications"]
            rows = sync_connection.execute(
                sa.select(
                    applications.c.requirements_must_have,
                    applications.c.requirements_nice_to_have,
                )
            ).all()
            assert rows == [([], []), ([], [])]
            assert len(history_content(sync_connection)) == 1

        await connection.run_sync(upgrade)
        await connection.commit()
        if connection.dialect.name == "sqlite":
            await connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            assert not (
                await connection.exec_driver_sql("PRAGMA foreign_key_check")
            ).all()


@pytest.mark.parametrize("db_engine", ["20260413_application_evidence"], indirect=True)
async def test_evidence_migration_refuses_destructive_downgrade(db_engine):
    async with db_engine.begin() as connection:
        await connection.run_sync(populate_prior_schema)
    async with db_engine.begin() as connection:
        history = sa.text("SELECT * FROM application_status_history ORDER BY id")
        before = (await connection.execute(history)).all()
        revision = await connection.scalar(
            sa.text("SELECT version_num FROM alembic_version")
        )
        assert revision == "20260413_application_evidence"
        with pytest.raises(
            RuntimeError, match="Evidence migration downgrade would lose evidence"
        ):
            await connection.run_sync(
                lambda sync_connection: command.downgrade(
                    migration_config(sync_connection), "20260412_account_sessions"
                )
            )
        assert (await connection.execute(history)).all() == before
        assert (
            await connection.scalar(sa.text("SELECT version_num FROM alembic_version"))
        ) == revision


async def test_historical_key_scope_upgrade_does_not_grant_generation(db_engine):
    async with db_engine.connect() as connection:
        if connection.dialect.name == "sqlite":
            await connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        await connection.run_sync(Base.metadata.drop_all)
        await connection.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
        await connection.commit()

        def run(sync_connection):
            config = migration_config(sync_connection)
            command.upgrade(config, "20260409_api_keys")
            populate_prior_schema(sync_connection)
            metadata = sa.MetaData()
            metadata.reflect(sync_connection)
            sync_connection.execute(
                metadata.tables["user_api_keys"]
                .insert()
                .values(
                    id="synthetic-old-key",
                    user_id="synthetic-owner",
                    label="Old key",
                    key_prefix="synthetic",
                    key_hash="not-a-real-key",
                    created_at=datetime(2026, 1, 1, tzinfo=UTC),
                )
            )
            command.upgrade(config, "head")
            metadata = sa.MetaData()
            metadata.reflect(sync_connection)
            key = sync_connection.execute(
                sa.select(metadata.tables["user_api_keys"])
            ).one()
            assert key.preset == "full_access"
            assert "analytics:read" in key.scopes
            assert "applications:write" in key.scopes
            assert "analytics:generate" not in key.scopes

        await connection.run_sync(run)
        await connection.commit()
        if connection.dialect.name == "sqlite":
            await connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            assert not (
                await connection.exec_driver_sql("PRAGMA foreign_key_check")
            ).all()
