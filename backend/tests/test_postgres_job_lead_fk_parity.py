import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401  # Ensure Base.metadata is fully populated
from app.core.database import Base

POSTGRES_TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
ALEMBIC_INI_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"
EXPECTED_JOB_LEAD_FK_NAME = "fk_job_leads_converted_to_application"


def _is_postgres_url(url: str) -> bool:
    return url.startswith(("postgresql://", "postgresql+", "postgres://"))


pytestmark = pytest.mark.asyncio


def _run_alembic_upgrade(connection, database_url: str) -> None:
    cfg = Config(str(ALEMBIC_INI_PATH))
    cfg.set_main_option("sqlalchemy.url", database_url)
    cfg.attributes["connection"] = connection
    command.upgrade(cfg, "head")


def _get_job_lead_conversion_fk_name(connection) -> str | None:
    inspector = inspect(connection)
    for foreign_key in inspector.get_foreign_keys("job_leads"):
        if foreign_key["constrained_columns"] == ["converted_to_application_id"]:
            return foreign_key["name"]
    return None


@pytest.mark.skipif(
    not _is_postgres_url(POSTGRES_TEST_DATABASE_URL),
    reason="Requires PostgreSQL test database. Set TEST_DATABASE_URL to a PostgreSQL URL.",
)
async def test_postgres_job_lead_conversion_fk_matches_model_and_drop_all_succeeds():
    engine = create_async_engine(POSTGRES_TEST_DATABASE_URL, echo=False)

    try:
        async with engine.begin() as conn:
            await conn.exec_driver_sql("DROP SCHEMA IF EXISTS public CASCADE")
            await conn.exec_driver_sql("CREATE SCHEMA public")
            await conn.exec_driver_sql("GRANT ALL ON SCHEMA public TO public")
            await conn.run_sync(_run_alembic_upgrade, POSTGRES_TEST_DATABASE_URL)
            fk_name = await conn.run_sync(_get_job_lead_conversion_fk_name)

        assert fk_name == EXPECTED_JOB_LEAD_FK_NAME

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    finally:
        async with engine.begin() as conn:
            await conn.exec_driver_sql("DROP SCHEMA IF EXISTS public CASCADE")
            await conn.exec_driver_sql("CREATE SCHEMA public")
            await conn.exec_driver_sql("GRANT ALL ON SCHEMA public TO public")
        await engine.dispose()
