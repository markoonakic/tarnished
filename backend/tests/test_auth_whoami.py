"""Focused tests for /api/auth/whoami."""

import pytest
from httpx import AsyncClient
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
        email="whoami@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def jwt_headers(test_user: User) -> dict[str, str]:
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def api_key_auth(db: AsyncSession, test_user: User) -> tuple[UserAPIKey, str]:
    raw_key = generate_api_token()
    api_key = UserAPIKey(
        user_id=test_user.id,
        label="MacBook CLI",
        preset="custom",
        scopes=["applications:read"],
        key_prefix=raw_key[:8],
        key_hash=hash_api_key(raw_key),
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return api_key, raw_key


class TestAuthWhoAmI:
    async def test_valid_api_key_returns_identity_auth_method_and_api_key_metadata(
        self,
        client: AsyncClient,
        test_user: User,
        api_key_auth: tuple[UserAPIKey, str],
    ) -> None:
        api_key, raw_key = api_key_auth

        response = await client.get(
            "/api/auth/whoami",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["id"] == test_user.id
        assert payload["email"] == test_user.email
        assert payload["is_admin"] is False
        assert payload["is_active"] is True
        assert payload["auth_method"] == "api_key"
        assert payload["api_key"] is not None
        assert payload["api_key"]["id"] == api_key.id
        assert payload["api_key"]["label"] == "MacBook CLI"
        assert payload["api_key"]["preset"] == "custom"
        assert payload["api_key"]["scopes"] == ["applications:read"]
        assert payload["api_key"]["key_prefix"] == raw_key[:8]
        assert payload["api_key"]["created_at"] is not None
        assert payload["api_key"]["last_used_at"] is not None
        assert payload["api_key"]["revoked_at"] is None
        assert "key_hash" not in payload["api_key"]

    async def test_valid_jwt_returns_identity_auth_method_and_null_api_key(
        self,
        client: AsyncClient,
        test_user: User,
        jwt_headers: dict[str, str],
    ) -> None:
        response = await client.get("/api/auth/whoami", headers=jwt_headers)

        assert response.status_code == 200
        assert response.json() == {
            "id": test_user.id,
            "email": test_user.email,
            "is_admin": False,
            "is_active": True,
            "auth_method": "jwt",
            "api_key": None,
        }
