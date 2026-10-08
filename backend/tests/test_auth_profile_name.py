"""The account menu uses only its owner's saved display name."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models import User
from app.models.user_profile import UserProfile


async def test_me_returns_only_the_current_users_profile_name(
    client: AsyncClient, db: AsyncSession
):
    owner = User(email="name-owner@example.com", password_hash="unused", is_active=True)
    other = User(email="name-other@example.com", password_hash="unused", is_active=True)
    db.add_all([owner, other])
    await db.flush()
    db.add(UserProfile(user_id=other.id, display_name="Other person's name"))
    await db.commit()
    headers = {
        "Authorization": "Bearer "
        + create_access_token(
            {"sub": owner.id, "session_version": owner.session_version}
        )
    }
    response = await client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["display_name"] is None
    db.add(UserProfile(user_id=owner.id, display_name="Mila Jović"))
    await db.commit()
    response = await client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["display_name"] == "Mila Jović"
