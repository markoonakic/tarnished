"""Real migrated database/API lifecycle regressions (synthetic accounts only)."""

import asyncio
import base64
import hashlib
from datetime import UTC, datetime, timedelta

import bcrypt
import pytest
from jose import jwt
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.security import (
    create_access_token,
    get_password_hash,
    settings,
    verify_password,
)
from app.models import User

PASSWORD = "synthetic password 123"
NEW_PASSWORD = "replacement password 456"


@pytest.fixture(autouse=True)
def isolated_auth_rate_limit(monkeypatch):
    from app.core.rate_limit import limiter

    monkeypatch.setattr(limiter, "enabled", False)


async def account(db, email="owner@example.com", admin=True):
    user = User(email=email, password_hash=get_password_hash(PASSWORD), is_admin=admin)
    db.add(user)
    await db.commit()
    return user


async def login(client, user, password=PASSWORD):
    response = await client.post(
        "/api/auth/login", json={"email": user.email, "password": password}
    )
    assert response.status_code == 200
    return response.json()


def headers(tokens):
    return {"Authorization": "Bearer " + tokens["access_token"]}


async def rejected_sessions(client, tokens):
    for path in ("/api/auth/me", "/api/auth/whoami", "/api/profile"):
        assert (await client.get(path, headers=headers(tokens))).status_code == 401
    assert (
        await client.post(
            "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
    ).status_code == 401


async def test_registration_cannot_bypass_owner_setup_or_escalate_email(client, db, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "attacker@example.com")
    for suffix in ("", "?needs_setup=true&proof=operator", "?token=owner_bootstrapped"):
        response = await client.post(
            "/api/auth/register" + suffix,
            json={
                "email": "attacker@example.com",
                "password": PASSWORD,
                "is_admin": True,
            },
        )
        assert response.status_code == 409
    assert await db.scalar(select(func.count(User.id))) == 0
    assert (await client.get("/api/auth/setup-status")).json() == {"needs_setup": True}
    assert (
        await client.post(
            "/api/admin/users",
            json={"email": "attacker@example.com", "password": PASSWORD},
        )
    ).status_code == 401


async def test_admin_managed_accounts_and_private_content(client, db):
    owner = await account(db)
    owner_tokens = await login(client, owner)
    payload = {"email": "personal@example.com", "password": PASSWORD}
    response = await client.post(
        "/api/admin/users", headers=headers(owner_tokens), json=payload
    )
    assert response.status_code == 201
    personal = await db.get(User, response.json()["id"])
    assert not personal.is_admin
    personal_tokens = await login(client, personal)
    assert (
        await client.post(
            "/api/admin/users",
            headers=headers(personal_tokens),
            json={**payload, "email": "third@example.com"},
        )
    ).status_code == 403
    for tokens in (owner_tokens, personal_tokens):
        assert (
            await client.post(
                "/api/auth/register", headers=headers(tokens), json=payload
            )
        ).status_code == 202
        assert (
            await client.get("/api/admin/applications", headers=headers(tokens))
        ).status_code == 404
    assert (
        await client.patch(
            f"/api/admin/users/{owner.id}",
            headers=headers(owner_tokens),
            json={"is_admin": False},
        )
    ).status_code == 400
    assert (
        await client.delete(
            f"/api/admin/users/{owner.id}", headers=headers(owner_tokens)
        )
    ).status_code == 400


async def test_password_validation_boundaries_and_safe_login(client, db):
    owner = await account(db)
    tokens = await login(client, owner)
    for password in (
        "",
        "x" * 65,
        "é" * 65,
        "😀" * 65,
        None,
        {"secret": "do-not-echo"},
    ):
        for path, payload in (
            ("/api/admin/users", {"email": "new@example.com", "password": password}),
            (
                "/api/auth/change-password",
                {"current_password": PASSWORD, "new_password": password},
            ),
        ):
            response = await client.post(path, headers=headers(tokens), json=payload)
            assert response.status_code == 422
            assert "input" not in response.text and PASSWORD not in response.text
            if isinstance(password, str) and password:
                assert password not in response.text
    for password in ("x" * 73, "é" * 37, "😀" * 19, ""):
        response = await client.post(
            "/api/auth/login", json={"email": owner.email, "password": password}
        )
        assert response.status_code == 401
    for index, password in enumerate(("x", " ", "x" * 64, "é" * 64, "😀" * 50)):
        response = await client.post(
            "/api/admin/users",
            headers=headers(tokens),
            json={"email": f"valid-{index}@example.com", "password": password},
        )
        assert response.status_code == 201
        user = await db.get(User, response.json()["id"])
        await login(client, user, password)
    assert verify_password("short", get_password_hash("short"))
    for malformed in ("broken", "$2b$invalid", "☃"):
        assert not verify_password("short", malformed)
    assert not verify_password("\ud800", get_password_hash("short"))


@pytest.mark.parametrize("password", ["x", " ", "é" * 64, "😀" * 50, "😀" * 64])
def test_password_hash_roundtrip(password):
    hashed = get_password_hash(password)
    assert verify_password(password, hashed)
    assert not verify_password(password[:-1] + "y", hashed)


def test_long_password_does_not_ignore_bytes_after_bcrypt_limit():
    password = "😀" * 50
    different = "😀" * 49 + "😁"
    assert len(password.encode("utf-8")) == 200
    assert password.encode("utf-8")[:72] == different.encode("utf-8")[:72]
    hashed = get_password_hash(password)
    assert not verify_password(different, hashed)
    digest = base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())
    assert bcrypt.checkpw(digest, hashed.removeprefix("sha256:").encode("ascii"))
    assert not verify_password(digest.decode("ascii"), hashed)
    raw_digest_hash = bcrypt.hashpw(digest, bcrypt.gensalt()).decode()
    assert not verify_password(password, raw_digest_hash)


@pytest.mark.parametrize("password", ["short", " " * 72])
def test_existing_raw_bcrypt_hashes_still_verify(password):
    # Legacy passwords can exceed the new character limit; login must still work.
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode()
    assert verify_password(password, hashed)
    assert not verify_password("wrong", hashed)


def test_invalid_unicode_password_is_rejected_without_echoing_it():
    from app.schemas.auth import UserSetup

    with pytest.raises(ValueError, match="Password cannot be encoded as UTF-8"):
        UserSetup(email="new@example.com", password="\ud800")


def test_empty_password_cannot_be_hashed_or_verified():
    with pytest.raises(ValueError, match="Password must not be empty"):
        get_password_hash("")
    legacy_empty_hash = bcrypt.hashpw(b"", bcrypt.gensalt()).decode()
    assert not verify_password("", legacy_empty_hash)


@pytest.mark.parametrize("password", ["x", "😀" * 50])
async def test_short_and_long_password_change_and_admin_reset(client, db, password):
    owner = await account(db)
    personal = await account(db, "personal@example.com", False)
    admin_tokens = await login(client, owner)
    tokens = await login(client, personal)
    response = await client.post(
        "/api/auth/change-password",
        headers=headers(tokens),
        json={"current_password": PASSWORD, "new_password": password},
    )
    assert response.status_code == 204
    tokens = await login(client, personal, password)
    response = await client.patch(
        f"/api/admin/users/{personal.id}",
        headers=headers(admin_tokens),
        json={"password": password},
    )
    assert response.status_code == 200
    await rejected_sessions(client, tokens)
    await login(client, personal, password)


async def test_password_change_signout_reset_disable_and_key_independence(client, db):
    owner = await account(db)
    personal = await account(db, "personal@example.com", False)
    admin_tokens = await login(client, owner)
    tokens = await login(client, personal)
    key = (
        await client.post(
            "/api/settings/api-keys",
            headers=headers(tokens),
            json={"label": "synthetic"},
        )
    ).json()
    key_headers = {"X-API-Key": key["api_key"]}
    for path in ("/api/auth/change-password", "/api/auth/signout-all"):
        assert (
            await client.post(
                path,
                headers=key_headers,
                json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
            )
        ).status_code in (401, 403)
    response = await client.post(
        "/api/auth/change-password",
        headers=headers(tokens),
        json={"current_password": "wrong", "new_password": NEW_PASSWORD},
    )
    assert response.status_code == 400
    assert (
        await client.get("/api/auth/me", headers=headers(tokens))
    ).status_code == 200
    response = await client.post(
        "/api/auth/change-password",
        headers=headers(tokens),
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert response.status_code == 204
    await rejected_sessions(client, tokens)
    assert (
        await client.get("/api/auth/whoami", headers=key_headers)
    ).status_code == 200
    tokens = await login(client, personal, NEW_PASSWORD)
    assert (
        await client.post("/api/auth/signout-all", headers=headers(tokens))
    ).status_code == 204
    await rejected_sessions(client, tokens)
    tokens = await login(client, personal, NEW_PASSWORD)
    for field in ("password", "is_admin", "is_active"):
        assert (
            await client.patch(
                f"/api/admin/users/{personal.id}",
                headers=headers(admin_tokens),
                json={field: None},
            )
        ).status_code == 422
    assert (
        await client.patch(
            f"/api/admin/users/{personal.id}",
            headers=headers(admin_tokens),
            json={"password": ""},
        )
    ).status_code == 422
    assert (
        await client.patch(
            f"/api/admin/users/{personal.id}", headers=headers(admin_tokens), json={}
        )
    ).status_code == 200
    assert (
        await client.get("/api/auth/me", headers=headers(tokens))
    ).status_code == 200
    for change in ({"password": PASSWORD}, {"is_admin": True}, {"is_active": False}):
        response = await client.patch(
            f"/api/admin/users/{personal.id}",
            headers=headers(admin_tokens),
            json=change,
        )
        assert response.status_code == 200
        await rejected_sessions(client, tokens)
        if change == {"is_active": False}:
            assert (
                await client.get("/api/auth/whoami", headers=key_headers)
            ).status_code == 403
            assert (
                await client.post(
                    "/api/auth/login",
                    json={"email": personal.email, "password": PASSWORD},
                )
            ).status_code == 403
            assert (
                await client.patch(
                    f"/api/admin/users/{personal.id}",
                    headers=headers(admin_tokens),
                    json={"is_active": True},
                )
            ).status_code == 200
            await rejected_sessions(client, tokens)
        tokens = await login(client, personal)
    assert (
        await client.get("/api/auth/whoami", headers=key_headers)
    ).status_code == 200
    assert (
        await client.delete(
            f"/api/settings/api-keys/{key['id']}", headers=headers(tokens)
        )
    ).status_code == 204
    assert (
        await client.get("/api/auth/whoami", headers=key_headers)
    ).status_code == 401


@pytest.mark.parametrize("path", ["change-password", "signout-all"])
async def test_expired_access_security_action_recovers_with_valid_refresh(
    client, db, path
):
    personal = await account(db, admin=False)
    tokens = await login(client, personal)
    expired = jwt.encode(
        {
            "sub": personal.id,
            "session_version": personal.session_version,
            "type": "access",
            "exp": int((datetime.now(UTC) - timedelta(minutes=1)).timestamp()),
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    payload = (
        {"current_password": PASSWORD, "new_password": NEW_PASSWORD}
        if path == "change-password"
        else None
    )
    response = await client.post(
        f"/api/auth/{path}",
        headers={"Authorization": "Bearer " + expired},
        json=payload,
    )
    assert response.status_code == 401
    await db.refresh(personal)
    assert personal.session_version == 0
    assert verify_password(PASSWORD, personal.password_hash)

    response = await client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 200
    refreshed = response.json()
    assert (
        await client.post(f"/api/auth/{path}", headers=headers(refreshed), json=payload)
    ).status_code == 204
    await rejected_sessions(client, tokens)
    await rejected_sessions(client, refreshed)
    await login(
        client, personal, NEW_PASSWORD if path == "change-password" else PASSWORD
    )


async def test_typed_claims_proof_misuse_and_legacy_tokens(client, db):
    owner = await account(db)
    base = {
        "sub": owner.id,
        "session_version": 0,
        "type": "access",
        "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
    }
    claims = [{k: v for k, v in base.items() if k != missing} for missing in base]
    claims += [
        {**base, **change}
        for change in (
            {"sub": [owner.id]},
            {"sub": 12},
            {"session_version": True},
            {"session_version": "0"},
            {"session_version": 1},
            {"exp": str(base["exp"])},
            {"type": "refresh"},
            {"type": "file"},
        )
    ]
    for payload in claims:
        token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
        for path in (
            "/api/auth/me",
            "/api/auth/whoami",
            "/api/profile",
            "/api/files/missing/cv",
        ):
            assert (
                await client.get(path, headers={"Authorization": "Bearer " + token})
            ).status_code == 401
    assert (
        await client.post(
            "/api/auth/refresh", json={"refresh_token": create_access_token(base)}
        )
    ).status_code == 401


async def test_concurrent_bootstrap_and_permanent_marker(db_engine):
    from app.services.accounts import bootstrap_owner, needs_owner_setup

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def attempt(email):
        async with sessions() as db:
            try:
                await bootstrap_owner(db, email, PASSWORD)
                return True
            except ValueError:
                return False

    results = await asyncio.gather(
        attempt("one@example.com"), attempt("two@example.com")
    )
    assert sorted(results) == [False, True]
    async with sessions() as db:
        assert await db.scalar(select(func.count(User.id))) == 1
        user = await db.scalar(select(User))
        assert user is not None and user.is_admin
        await db.delete(user)
        await db.commit()
        assert not await needs_owner_setup(db)
    assert not await attempt("three@example.com")


async def test_bootstrap_rollback_and_conditional_password_race(db_engine, monkeypatch):
    from app.services.accounts import bootstrap_owner, needs_owner_setup, update_account

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as db:
        original_commit = db.commit

        async def fail():
            raise RuntimeError("synthetic failure")

        monkeypatch.setattr(db, "commit", fail)
        with pytest.raises(RuntimeError):
            await bootstrap_owner(db, "owner@example.com", PASSWORD)
        monkeypatch.setattr(db, "commit", original_commit)
        assert await needs_owner_setup(db)
        await db.rollback()
        owner = await bootstrap_owner(db, "owner@example.com", PASSWORD)
        owner_id = owner.id

    async def change(password):
        async with sessions() as db:
            changed = await update_account(
                db, owner_id, password=password, expected_version=0
            )
            await db.commit()
            return changed

    assert sorted(await asyncio.gather(change(NEW_PASSWORD), change(PASSWORD))) == [
        False,
        True,
    ]
    async with sessions() as db:
        user = await db.get(User, owner_id)
        assert user is not None and user.session_version == 1


async def test_sse_rechecks_session_each_poll(client, db, monkeypatch):
    from app.api import import_router
    from app.services.transfer_jobs import create_transfer_job

    owner = await account(db)
    tokens = await login(client, owner)
    job = await create_transfer_job(
        db, user_id=owner.id, job_type="import_zip", status="processing"
    )
    original = import_router._get_job_payload
    calls = 0

    async def invalidate_after_read(*args):
        nonlocal calls
        payload = await original(*args)
        calls += 1
        if calls == 2:
            await db.execute(
                update(User)
                .where(User.id == owner.id)
                .values(session_version=User.session_version + 1)
            )
            await db.commit()
        return payload

    monkeypatch.setattr(import_router, "_get_job_payload", invalidate_after_read)
    response = await client.get(
        f"/api/import/progress/{job.id}", params={"token": tokens["access_token"]}
    )
    assert response.status_code == 200 and response.text.count("event: progress") == 1
    assert calls == 2
    assert (
        await client.get(
            f"/api/import/progress/{job.id}", params={"token": tokens["access_token"]}
        )
    ).status_code == 401


def test_password_verification_safely_rejects_invalid_inputs():
    hashed = get_password_hash("short")
    for value in ("x" * 73, "é" * 37, "😀" * 19, "\ud800"):
        assert not verify_password(value, hashed)
    assert not verify_password("short", "malformed")


async def test_legacy_short_password_login_and_malformed_hash_failure(client, db):
    owner = await account(db)
    owner.password_hash = get_password_hash("short")
    await db.commit()
    await login(client, owner, "short")
    owner.password_hash = "malformed"
    await db.commit()
    response = await client.post(
        "/api/auth/login", json={"email": owner.email, "password": "short"}
    )
    assert response.status_code == 401


def test_legacy_admin_email_configuration_is_inert_and_accepted(tmp_path):
    from app.core.config import Settings

    dotenv = tmp_path / "legacy.env"
    dotenv.write_text("ADMIN_EMAIL=legacy-owner@example.com\n")
    configuration = Settings(_env_file=dotenv, secret_key="synthetic-secret")  # pyright: ignore[reportCallIssue] # BaseSettings runtime keyword
    assert "admin_email" not in configuration.model_dump()
