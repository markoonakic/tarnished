"""Real operator module/hidden terminal and migration checks on owned test schemas."""

import asyncio
import os
import pty
import select as io_select
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text

from app.core.security import create_access_token, hash_api_key, verify_password
from app.models import User, UserAPIKey
from app.models.system_settings import SystemSettings

PASSWORD = "operator synthetic password"
REPLACEMENT = "operator replacement password"


def operator_process(database_url, arguments, password=PASSWORD):
    env = {
        name: os.environ[name]
        for name in ("PATH", "LD_LIBRARY_PATH", "HOME", "TMPDIR")
        if name in os.environ
    }
    env.update(
        DATABASE_URL=database_url,
        SECRET_KEY="test-secret-key-for-pytest",
        LITELLM_LOCAL_MODEL_COST_MAP="true",
    )
    master, slave = pty.openpty()
    process = subprocess.Popen(
        [sys.executable, "-m", "app.manage", *arguments],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        env=env,
        start_new_session=True,
    )
    os.close(slave)
    output = b""
    answered = 0
    deadline = time.monotonic() + 60
    try:
        while time.monotonic() < deadline:
            if io_select.select([master], [], [], 0.1)[0]:
                try:
                    chunk = os.read(master, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                output += chunk
                prompts = (b"New password: ", b"Confirm new password: ")
                if answered < 2 and prompts[answered] in output:
                    os.write(master, password.encode() + b"\n")
                    answered += 1
            elif process.poll() is not None:
                break
        code = process.wait(timeout=5)
        assert password.encode() not in output, "Hidden password was echoed"
        return code, output.decode(errors="replace")
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        os.close(master)


async def test_operator_concurrent_bootstrap_and_explicit_recovery(
    db_engine, db, client
):
    url = db_engine.url.render_as_string(hide_password=False)
    results = await asyncio.gather(
        *[
            asyncio.to_thread(
                operator_process, url, ["bootstrap-owner", "--email", email]
            )
            for email in ("one@example.com", "two@example.com")
        ]
    )
    assert sorted(code for code, _ in results) == [0, 1]
    users = (await db.scalars(select(User))).all()
    assert len(users) == 1 and users[0].is_admin
    owner = users[0]
    old_token = create_access_token(
        {"sub": owner.id, "session_version": owner.session_version}
    )
    key = UserAPIKey(
        user_id=owner.id,
        label="synthetic",
        key_prefix="synthetic",
        key_hash=hash_api_key("synthetic-key"),
        scopes=["files:read"],
    )
    db.add(key)
    owner.is_admin = False
    owner.is_active = False
    await db.commit()
    # Reset alone never silently restores active/admin authority or revokes keys.
    code, output = await asyncio.to_thread(
        operator_process, url, ["reset-password", "--email", owner.email], REPLACEMENT
    )
    assert code == 0
    await db.refresh(owner)
    await db.refresh(key)
    assert not owner.is_active and not owner.is_admin and key.revoked_at is None
    assert verify_password(REPLACEMENT, owner.password_hash)
    code, output = await asyncio.to_thread(
        operator_process,
        url,
        [
            "reset-password",
            "--email",
            owner.email,
            "--reactivate",
            "--recover-admin",
            "--revoke-all-keys",
        ],
    )
    assert code == 0
    await db.refresh(owner)
    await db.refresh(key)
    assert owner.is_active and owner.is_admin and key.revoked_at is not None
    assert verify_password(PASSWORD, owner.password_hash)
    assert (
        await client.get(
            "/api/auth/me", headers={"Authorization": "Bearer " + old_token}
        )
    ).status_code == 401
    assert (
        await client.post(
            "/api/auth/login", json={"email": owner.email, "password": PASSWORD}
        )
    ).status_code == 200
    code, _ = await asyncio.to_thread(
        operator_process, url, ["reset-password", "--email", "missing@example.com"]
    )
    assert code == 1
    code, _ = await asyncio.to_thread(
        operator_process, url, ["reset-password", "--email", owner.email], "weak-secret"
    )
    assert code == 1
    await db.refresh(owner)
    assert verify_password(PASSWORD, owner.password_hash)


@pytest.mark.parametrize("db_engine", ["20260411_job_lead_fk_name"], indirect=True)
async def test_session_migration_backfill_and_bootstrap_marker(db_engine):
    # Start at the predecessor; never cross the later evidence downgrade refusal.
    def migrate(connection, target, downgrade=False):
        cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        cfg.attributes["connection"] = connection
        (command.downgrade if downgrade else command.upgrade)(cfg, target)

    async with db_engine.begin() as connection:
        assert (
            await connection.scalar(text("SELECT version_num FROM alembic_version"))
        ) == "20260411_job_lead_fk_name"
        await connection.execute(
            text(
                "INSERT INTO users (id, email, password_hash, is_admin, is_active, created_at) VALUES ('prior', 'prior@example.com', 'legacy', true, true, CURRENT_TIMESTAMP)"
            )
        )
        await connection.run_sync(migrate, "20260412_account_sessions")
        assert (
            await connection.execute(
                text("SELECT session_version FROM users WHERE id='prior'")
            )
        ).scalar_one() == 0
        assert (
            await connection.execute(
                select(SystemSettings.key).where(
                    SystemSettings.key == "owner_bootstrapped"
                )
            )
        ).scalar_one() == "owner_bootstrapped"
        await connection.execute(text("DELETE FROM users"))
        await connection.run_sync(migrate, "20260411_job_lead_fk_name", True)
        await connection.run_sync(migrate, "20260412_account_sessions")
        assert (
            await connection.execute(
                select(SystemSettings.key).where(
                    SystemSettings.key == "owner_bootstrapped"
                )
            )
        ).scalar_one() == "owner_bootstrapped"


def test_operator_refuses_visible_password_input(monkeypatch):
    import getpass
    import warnings

    from app.manage import confirmed_password

    def visible_fallback(prompt):
        warnings.warn(
            "Can not control echo on the terminal.",
            getpass.GetPassWarning,
            stacklevel=2,
        )
        pytest.fail("must not read visible password")

    monkeypatch.setattr(getpass, "getpass", visible_fallback)
    with pytest.raises(getpass.GetPassWarning):
        confirmed_password()


async def test_operator_requires_migrated_schema_without_prompting(tmp_path):
    code, output = await asyncio.to_thread(
        operator_process,
        f"sqlite+aiosqlite:///{tmp_path}/unmigrated.db",
        ["bootstrap-owner", "--email", "owner@example.com"],
    )
    assert code == 1
    assert "schema not ready" in output
    assert "New password:" not in output


def test_entrypoint_operator_dispatch_uses_existing_secret_and_never_migrates(tmp_path):
    # Exercise the source dispatch with only its fixed storage path redirected
    # into our synthetic directory; never inspect the deployment's secret file.
    data = tmp_path / "data"
    data.mkdir()
    script = tmp_path / "entrypoint.sh"
    source = (Path(__file__).resolve().parents[2] / "entrypoint.sh").read_text()
    script.write_text(source.replace("/app/data", str(data)))
    binary = tmp_path / "bin"
    binary.mkdir()
    python = binary / "python"
    python.write_text(
        '#!/bin/sh\n[ "$SECRET_KEY" = "synthetic-persisted-secret" ] || exit 9\n[ "$*" = "-m app.manage bootstrap-owner --email owner@example.com" ] || exit 8\necho operator-dispatched\n'
    )
    python.chmod(0o700)
    for executable in ("mkdir", "alembic", "uvicorn"):
        path = binary / executable
        path.write_text("#!/bin/sh\nexit 7\n")
        path.chmod(0o700)
    env = {"PATH": str(binary) + os.pathsep + os.environ["PATH"]}
    args = [
        "sh",
        str(script),
        "manage",
        "bootstrap-owner",
        "--email",
        "owner@example.com",
    ]
    missing = subprocess.run(args, env=env, capture_output=True, text=True, timeout=5)
    assert (
        missing.returncode == 1
        and "Configured SECRET_KEY unavailable" in missing.stderr
    )
    assert not (data / ".secret_key").exists()
    secret = data / ".secret_key"
    secret.write_text("synthetic-persisted-secret\n")
    secret.chmod(0o600)
    existing = subprocess.run(args, env=env, capture_output=True, text=True, timeout=5)
    assert existing.returncode == 0 and existing.stdout == "operator-dispatched\n"
    assert secret.read_text() == "synthetic-persisted-secret\n"
    assert "synthetic-persisted-secret" not in existing.stdout + existing.stderr
