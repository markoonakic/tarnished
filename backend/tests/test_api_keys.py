"""Focused tests for multi-key API-key management."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    generate_api_token,
    get_password_hash,
    hash_api_key,
)
from app.models import User, UserAPIKey


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="api-keys@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def admin_user(db: AsyncSession) -> User:
    user = User(
        email="api-keys-admin@example.com",
        password_hash=get_password_hash("adminpass123"),
        is_admin=True,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


class TestAPIKeysList:
    async def test_list_api_keys_returns_empty_list_for_new_user(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.get("/api/settings/api-keys", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == []


class TestAPIKeysCreate:
    async def test_create_api_key_returns_raw_key_once_and_stores_hash(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            "/api/settings/api-keys",
            headers=auth_headers,
            json={"label": "MacBook CLI"},
        )

        assert response.status_code == 201
        payload = response.json()
        assert payload["label"] == "MacBook CLI"
        assert isinstance(payload["api_key"], str)
        assert payload["api_key"]
        assert payload["key_prefix"]
        assert payload["last_used_at"] is None
        assert payload["revoked_at"] is None

        result = await db.execute(
            select(UserAPIKey).where(UserAPIKey.id == payload["id"])
        )
        api_key = result.scalar_one()

        assert api_key.user_id == test_user.id
        assert api_key.label == "MacBook CLI"
        assert api_key.key_prefix == payload["key_prefix"]
        assert api_key.key_hash != payload["api_key"]


class TestAPIKeyAuth:
    async def test_machine_route_accepts_x_api_key_from_user_api_keys(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
    ) -> None:
        raw_key = generate_api_token()
        api_key = UserAPIKey(
            user_id=test_user.id,
            label="Firefox Extension",
            key_prefix=raw_key[:8],
            key_hash=hash_api_key(raw_key),
        )
        db.add(api_key)
        await db.commit()

        response = await client.get(
            "/api/users/settings",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["theme"]

    async def test_machine_route_rejects_api_key_in_bearer_header(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
    ) -> None:
        raw_key = generate_api_token()
        api_key = UserAPIKey(
            user_id=test_user.id,
            label="Firefox Extension",
            key_prefix=raw_key[:8],
            key_hash=hash_api_key(raw_key),
        )
        db.add(api_key)
        await db.commit()

        response = await client.get(
            "/api/users/settings",
            headers={"Authorization": f"Bearer {raw_key}"},
        )

        assert response.status_code == 401


class TestAPIKeysLifecycle:
    async def test_rename_api_key_updates_label(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        api_key = UserAPIKey(
            user_id=test_user.id,
            label="Old Label",
            key_prefix="abcd1234",
            key_hash=hash_api_key(generate_api_token()),
        )
        db.add(api_key)
        await db.commit()
        await db.refresh(api_key)

        response = await client.patch(
            f"/api/settings/api-keys/{api_key.id}",
            headers=auth_headers,
            json={"label": "New Label"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["label"] == "New Label"

        await db.refresh(api_key)
        assert api_key.label == "New Label"

    async def test_delete_api_key_revokes_instead_of_hard_deleting(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        api_key = UserAPIKey(
            user_id=test_user.id,
            label="Firefox Extension",
            key_prefix="abcd1234",
            key_hash=hash_api_key(generate_api_token()),
        )
        db.add(api_key)
        await db.commit()
        await db.refresh(api_key)

        response = await client.delete(
            f"/api/settings/api-keys/{api_key.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204
        await db.refresh(api_key)
        assert api_key.revoked_at is not None


class TestAPIKeyRouteCoverage:
    async def test_api_key_can_access_round_type_listing(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
    ) -> None:
        raw_key = generate_api_token()
        db.add(
            UserAPIKey(
                user_id=test_user.id,
                label="MacBook CLI",
                key_prefix=raw_key[:8],
                key_hash=hash_api_key(raw_key),
            )
        )
        await db.commit()

        response = await client.get(
            "/api/round-types",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200


class TestLegacyAPIKeyEndpoints:
    async def test_legacy_get_api_key_endpoint_is_removed(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.get("/api/settings/api-key", headers=auth_headers)

        assert response.status_code == 404

    async def test_legacy_regenerate_api_key_endpoint_is_removed(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            "/api/settings/api-key/regenerate",
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_api_key_can_access_export_json(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
    ) -> None:
        raw_key = generate_api_token()
        db.add(
            UserAPIKey(
                user_id=test_user.id,
                label="MacBook CLI",
                key_prefix=raw_key[:8],
                key_hash=hash_api_key(raw_key),
            )
        )
        await db.commit()

        response = await client.get(
            "/api/export/json",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200

    async def test_admin_api_key_can_access_admin_users(
        self,
        client: AsyncClient,
        db: AsyncSession,
        admin_user: User,
    ) -> None:
        raw_key = generate_api_token()
        db.add(
            UserAPIKey(
                user_id=admin_user.id,
                label="Admin CLI",
                key_prefix=raw_key[:8],
                key_hash=hash_api_key(raw_key),
            )
        )
        await db.commit()

        response = await client.get(
            "/api/admin/users",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
