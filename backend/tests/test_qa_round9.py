"""Temporary pool exhaustion must be recoverable on every database read."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from tests.test_core_mutation_integrity import workspace as workspace

from app.core.database import get_db
from app.main import app


@pytest.mark.parametrize(
    "path", ["/api/analytics/kpis?period=all", "/api/user-preferences"]
)
async def test_exhausted_pool_returns_named_busy_then_recovers(
    path, client, db_engine, workspace
):
    # Use the migrated workspace with a real bounded pool, not a mocked exception.
    engine = create_async_engine(
        db_engine.url, pool_size=1, max_overflow=0, pool_timeout=0.02
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def sessions():
        async with factory() as session:
            yield session

    original = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = sessions
    try:
        async with engine.connect() as held:
            await held.execute(text("SELECT 1"))
            response = await client.get(path)
            assert response.status_code == 503
            assert response.json() == {"code": "database_busy"}
            assert response.headers["retry-after"] == "1"
            assert "QueuePool" not in response.text
        recovered = await client.get(path)
        assert recovered.status_code == 200
    finally:
        app.dependency_overrides[get_db] = original
        await engine.dispose()
