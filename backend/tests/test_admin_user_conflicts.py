"""Authority and deletion checks for stale administrator views."""

import pytest
from sqlalchemy import select

from app.core.security import get_password_hash, verify_password
from app.models import User

PASSWORD = "synthetic password"


@pytest.fixture(autouse=True)
def no_limits(monkeypatch):
    from app.core.rate_limit import limiter

    monkeypatch.setattr(limiter, "enabled", False)


async def admin_headers(client, db):
    admin = User(
        email="owner@example.com",
        password_hash=get_password_hash(PASSWORD),
        is_admin=True,
    )
    db.add(admin)
    await db.commit()
    response = await client.post(
        "/api/auth/login", json={"email": admin.email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["access_token"]}


async def test_stale_password_edit_cannot_restore_revoked_role(client, db):
    headers = await admin_headers(client, db)
    created = await client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "another@example.com",
            "password": PASSWORD,
            "is_admin": True,
        },
    )
    assert created.status_code == 201
    initial = created.json()
    assert initial["revision"] == 0
    listed = (await client.get("/api/admin/users", headers=headers)).json()["items"]
    assert next(row for row in listed if row["id"] == initial["id"])["revision"] == 0
    path = "/api/admin/users/" + initial["id"]
    removed = await client.patch(
        path, headers=headers, json={"expected_revision": 0, "is_admin": False}
    )
    assert removed.status_code == 200 and removed.json()["revision"] == 1
    stale = await client.patch(
        path,
        headers=headers,
        json={
            "expected_revision": 0,
            "is_admin": True,
            "is_active": True,
            "password": "replacement",
        },
    )
    assert stale.status_code == 409
    user = await db.get(User, initial["id"])
    await db.refresh(user)
    assert not user.is_admin and verify_password(PASSWORD, user.password_hash)
    login = await client.post(
        "/api/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert login.status_code == 200
    assert (
        await client.get(
            "/api/admin/stats",
            headers={
                "Authorization": "Bearer " + login.json()["access_token"],
            },
        )
    ).status_code == 403
    retry = await client.patch(
        path, headers=headers, json={"expected_revision": 1, "password": "replacement"}
    )
    assert retry.status_code == 200 and retry.json()["revision"] == 2
    assert not retry.json()["is_admin"]


@pytest.mark.parametrize("send_revision", [True, False])
async def test_reject_cannot_delete_approved_account_or_content(
    client, db, send_revision
):
    headers = await admin_headers(client, db)
    request = await client.post(
        "/api/auth/register",
        json={"email": "pending@example.com", "password": PASSWORD},
    )
    assert request.status_code == 202
    pending = await db.scalar(select(User).where(User.email == "pending@example.com"))
    path = "/api/admin/users/" + pending.id
    approved = await client.patch(
        path, headers=headers, json={"expected_revision": 0, "approval_pending": False}
    )
    assert approved.status_code == 200
    login = await client.post(
        "/api/auth/login", json={"email": pending.email, "password": PASSWORD}
    )
    user_headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    company = await client.post(
        "/api/companies", headers=user_headers, json={"name": "Kept content"}
    )
    assert company.status_code == 201
    params = {
        "pending_only": True,
        **({"expected_revision": 0} if send_revision else {}),
    }
    rejected = await client.delete(path, headers=headers, params=params)
    assert rejected.status_code == 409
    assert (await client.get("/api/auth/me", headers=user_headers)).status_code == 200
    assert (
        await client.get("/api/companies/" + company.json()["id"], headers=user_headers)
    ).status_code == 200
    assert (
        await client.delete(path, headers=headers, params={"expected_revision": 1})
    ).status_code == 204


async def test_current_pending_reject_and_stale_active_delete(client, db):
    headers = await admin_headers(client, db)
    await client.post(
        "/api/auth/register",
        json={"email": "pending@example.com", "password": PASSWORD},
    )
    pending = await db.scalar(select(User).where(User.email == "pending@example.com"))
    assert (
        await client.delete(
            "/api/admin/users/" + pending.id,
            headers=headers,
            params={"expected_revision": 0, "pending_only": True},
        )
    ).status_code == 204
    created = (
        await client.post(
            "/api/admin/users",
            headers=headers,
            json={
                "email": "active@example.com",
                "password": PASSWORD,
            },
        )
    ).json()
    path = "/api/admin/users/" + created["id"]
    assert (
        await client.patch(
            path, headers=headers, json={"expected_revision": 0, "is_active": False}
        )
    ).status_code == 200
    assert (
        await client.delete(path, headers=headers, params={"expected_revision": 0})
    ).status_code == 409
