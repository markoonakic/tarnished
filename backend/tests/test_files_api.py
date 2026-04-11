from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import Application, ApplicationStatus, User


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="files-api@example.com",
        password_hash=get_password_hash("testpass123"),
        is_active=True,
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def status(db: AsyncSession) -> ApplicationStatus:
    status = ApplicationStatus(
        name="Applied",
        color="#83a598",
        is_default=True,
        user_id=None,
        order=1,
    )
    db.add(status)
    await db.commit()
    await db.refresh(status)
    return status


@pytest.mark.asyncio
async def test_file_endpoint_rejects_absolute_paths_outside_upload_dir(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict[str, str],
    status: ApplicationStatus,
    tmp_path: Path,
):
    external_file = tmp_path / "outside.pdf"
    external_file.write_bytes(b"secret")

    application = Application(
        user_id=test_user.id,
        company="Unsafe Paths Inc",
        job_title="Engineer",
        status_id=status.id,
        applied_at=__import__("datetime").date.today(),
        cv_path=str(external_file),
        cv_original_filename="outside.pdf",
    )
    db.add(application)
    await db.commit()
    await db.refresh(application)

    response = await client.get(
        f"/api/files/{application.id}/cv",
        headers=auth_headers,
    )

    assert response.status_code == 404
