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

    token = create_access_token({"sub": user.id})
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "migration-smoke@example.com"
