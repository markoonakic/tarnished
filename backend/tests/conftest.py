"""Pytest configuration and fixtures for testing."""

# IMPORTANT: Set environment variables BEFORE any imports
import os
import tempfile
from pathlib import Path
from uuid import uuid4

os.environ["ENABLE_RATE_LIMITING"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest"
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get(
        "TEST_DATABASE_URL",
        f"sqlite+aiosqlite:///{Path(tempfile.gettempdir()) / 'job-tracker-test-bootstrap.db'}",
    ),
)

import asyncio
import warnings
from typing import AsyncGenerator, Generator

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.exc import SAWarning
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.main import app

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
ALEMBIC_INI_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"

warnings.filterwarnings(
    "ignore",
    message=r"Skipped unsupported reflection of expression-based index .*",
    category=SAWarning,
)


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an instance of the event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


def _build_database_url() -> tuple[str, Path | None]:
    if TEST_DATABASE_URL:
        return TEST_DATABASE_URL, None

    sqlite_path = Path(tempfile.gettempdir()) / f"job-tracker-test-{uuid4()}.db"
    return f"sqlite+aiosqlite:///{sqlite_path}", sqlite_path


def _run_alembic_upgrade(connection, database_url: str) -> None:
    cfg = Config(str(ALEMBIC_INI_PATH))
    cfg.set_main_option("sqlalchemy.url", database_url)
    cfg.attributes["connection"] = connection
    command.upgrade(cfg, "head")


@pytest.fixture(scope="function")
async def db_engine():
    """Create a test database engine using Alembic migrations."""
    database_url, sqlite_path = _build_database_url()
    engine = create_async_engine(database_url, echo=False)
    is_sqlite = "sqlite" in database_url

    if is_sqlite:

        @event.listens_for(engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    async with engine.begin() as conn:
        if TEST_DATABASE_URL:
            if is_sqlite:
                await conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
            await conn.run_sync(Base.metadata.drop_all)
            await conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
            if is_sqlite:
                await conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        await conn.run_sync(_run_alembic_upgrade, database_url)

    yield engine

    if sqlite_path is None:
        async with engine.begin() as conn:
            if is_sqlite:
                await conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
            await conn.run_sync(Base.metadata.drop_all)
            if is_sqlite:
                await conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    await engine.dispose()

    if sqlite_path is not None and sqlite_path.exists():
        sqlite_path.unlink()


@pytest.fixture(scope="function")
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session_maker() as session:
        yield session


@pytest.fixture(scope="function")
async def client(db: AsyncSession, db_engine) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with database dependency override."""

    async def override_get_db():
        yield db

    from app.api import export, import_router
    from app.core.database import get_db

    original_import_session_maker = import_router.async_session_maker
    original_export_session_maker = export.async_session_maker
    patched_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    import_router.async_session_maker = patched_session_maker
    export.async_session_maker = patched_session_maker
    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    import_router.async_session_maker = original_import_session_maker
    export.async_session_maker = original_export_session_maker
    app.dependency_overrides.clear()
