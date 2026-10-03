"""First-run HTTP setup stays one-time, validated and rate limited."""

import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.main import app
from app.models import User

PASSWORD = "synthetic password 123"


@pytest.fixture(autouse=True)
def isolated_limits(monkeypatch):
    monkeypatch.setattr(limiter, "enabled", False)


async def test_setup_once_and_normal_login(client, db):
    assert (await client.get("/api/auth/setup-status")).json() == {"needs_setup": True}
    payload = {"email": "owner@example.com", "password": PASSWORD}
    response = await client.post("/api/auth/setup", json=payload)
    assert response.status_code == 201
    assert response.json()["is_admin"] is True
    assert response.json()["is_active"] is True
    assert "password" not in response.text and "token" not in response.text
    assert (await client.get("/api/auth/setup-status")).json() == {"needs_setup": False}
    assert (await client.post("/api/auth/login", json=payload)).status_code == 200
    assert (await client.post("/api/auth/setup", json=payload)).status_code == 409
    assert (
        await client.post(
            "/api/auth/setup", json={**payload, "email": "second@example.com"}
        )
    ).status_code == 409
    user = await db.scalar(select(User))
    await db.delete(user)
    await db.commit()
    assert (await client.get("/api/auth/setup-status")).json() == {"needs_setup": False}
    assert (await client.post("/api/auth/setup", json=payload)).status_code == 409


async def test_existing_account_blocks_setup(client, db):
    from app.core.security import get_password_hash

    db.add(
        User(email="existing@example.com", password_hash=get_password_hash(PASSWORD))
    )
    await db.commit()
    assert (await client.get("/api/auth/setup-status")).json() == {"needs_setup": False}
    assert (
        await client.post(
            "/api/auth/setup", json={"email": "new@example.com", "password": PASSWORD}
        )
    ).status_code == 409
    assert await db.scalar(select(func.count(User.id))) == 1


async def test_concurrent_http_setup_creates_only_one_owner(client, db_engine):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def independent_db():
        async with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = independent_db
    responses = await asyncio.gather(
        *(
            client.post("/api/auth/setup", json={"email": email, "password": PASSWORD})
            for email in ("one@example.com", "two@example.com")
        )
    )
    assert sorted(response.status_code for response in responses) == [201, 409]
    async with sessions() as db:
        assert await db.scalar(select(func.count(User.id))) == 1
        assert (await db.scalar(select(User))).is_admin


@pytest.mark.parametrize(
    "password",
    ["", "shortsecret", "é" * 37, "😀" * 19, "x" * 73, None, {"secret": "canary"}],
)
async def test_setup_password_validation(client, db, password):
    response = await client.post(
        "/api/auth/setup", json={"email": "owner@example.com", "password": password}
    )
    assert response.status_code == 422
    assert "input" not in response.text and "canary" not in response.text
    if isinstance(password, str) and password:
        assert password not in response.text
    assert await db.scalar(select(func.count(User.id))) == 0
    assert (await client.get("/api/auth/setup-status")).json() == {"needs_setup": True}


async def test_setup_email_validation(client):
    assert (
        await client.post(
            "/api/auth/setup", json={"email": "not-an-email", "password": PASSWORD}
        )
    ).status_code == 422


async def test_setup_and_login_rate_limits(client, monkeypatch):
    monkeypatch.setenv("ENABLE_RATE_LIMITING", "true")
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    payload = {"email": "owner@example.com", "password": PASSWORD}
    try:
        for index in range(10):
            response = await client.post("/api/auth/setup", json=payload)
            assert response.status_code == (201 if index == 0 else 409)
        assert (await client.post("/api/auth/setup", json=payload)).status_code == 429
        for _ in range(10):
            assert (
                await client.post("/api/auth/login", json=payload)
            ).status_code == 200
        assert (await client.post("/api/auth/login", json=payload)).status_code == 429
    finally:
        limiter.reset()
