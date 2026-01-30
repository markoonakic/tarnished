import asyncio
import io
import zipfile
from httpx import AsyncClient, ASGITransport
from app.main import app
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.database import Base
from app.core.security import get_password_hash
from app.models import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

async def test():
    # Setup DB
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session_maker() as db:
        # Create test user
        user = User(
            email="test@example.com",
            password_hash=get_password_hash("testpass123"),
            is_admin=True,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        
        # Override get_db
        async def override_get_db():
            yield db
        
        from app.core.database import get_db
        app.dependency_overrides[get_db] = override_get_db
        
        # Create test ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('data.json', '{"applications": [], "custom_statuses": [], "custom_round_types": []}')
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.read()
        
        # Test without auth
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            files = {"file": ("import.zip", zip_bytes, "application/zip")}
            response = await client.post("/api/import/validate", files=files)
            print(f"Status: {response.status_code}")
            print(f"Body: {response.text}")
        
        app.dependency_overrides.clear()
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

asyncio.run(test())
