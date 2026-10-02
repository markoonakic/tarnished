import logging
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import User


async def test_test_harness_runs_migrations_before_api_tests(
    db: AsyncSession,
    client,
):
    version_result = await db.execute(text("SELECT version_num FROM alembic_version"))
    assert version_result.scalar_one() is not None

    user = User(
        email="migration-smoke@example.com",
        password_hash=get_password_hash("testpass123"),
        is_active=True,
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(
        {"sub": user.id, "session_version": user.session_version}
    )
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "migration-smoke@example.com"


async def test_migrations_preserve_application_logging(db_engine, caplog):
    logger = logging.getLogger("app.services.interview_text.validation")
    logger.warning("Migration logging check")
    assert "Migration logging check" in caplog.text


def test_migrations_accept_percent_in_database_url(tmp_path):
    database = tmp_path / "percent%name.db"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=Path(__file__).resolve().parents[1],
        env={**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{database}"},
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert database.is_file()
