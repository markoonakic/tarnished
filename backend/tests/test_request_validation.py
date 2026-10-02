import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace

from app.models import User
from app.services.user_settings import merge_user_settings


async def test_analytics_rejects_invalid_years_and_ignores_invalid_time_zones(
    client, workspace
):
    for year in (0, -1, 10000):
        response = await client.get("/api/analytics/heatmap", params={"year": year})
        assert response.status_code == 422
    for zone in ("../UTC", "/etc/passwd", "missing/zone"):
        response = await client.get(
            "/api/analytics/pipeline", headers={"Time-Zone": zone}
        )
        assert response.status_code == 200
        assert response.json()["scope"]["time_zone"] == "UTC"


async def test_import_export_key_can_read_a_complete_archive(client, workspace):
    response = await client.post(
        "/api/settings/api-keys",
        json={"label": "Archive", "preset": "import_export"},
    )
    assert response.status_code == 201
    key = response.json()["api_key"]
    client.headers.pop("Authorization")
    client.headers["X-API-Key"] = key
    exported = await client.get("/api/export/zip")
    assert exported.status_code == 200
    assert exported.headers["content-type"] == "application/zip"
    assert (await client.get("/api/admin/users")).status_code == 403


async def test_concurrent_settings_updates_preserve_unrelated_fields(
    db_engine, workspace
):
    owner = workspace[0]
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def change(index):
        async with sessions() as session:
            await merge_user_settings(
                session, user_id=owner.id, updates={str(index): index}
            )

    await asyncio.gather(*(change(index) for index in range(8)))
    async with sessions() as session:
        settings = await session.scalar(
            select(User.settings).where(User.id == owner.id)
        )
    assert settings == {str(index): index for index in range(8)}
