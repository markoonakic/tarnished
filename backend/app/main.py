from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.auth import router as auth_router
from app.api.applications import router as applications_router
from app.api.application_history import router as application_history_router
from app.api.rounds import router as rounds_router
from app.api.settings import router as settings_router
from app.api.analytics import router as analytics_router
from app.api.admin import router as admin_router
from app.api.export import router as export_router
from app.api.import_router import router as import_router
from app.api.import_router import limiter
from app.api.files import router as files_router
from app.api.dashboard import router as dashboard_router
from app.api.user_preferences import router as user_preferences_router
from app.api.streak import router as streak_router
from app.core.database import async_session_maker
from app.core.seed import seed_defaults


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_session_maker() as db:
        await seed_defaults(db)
    yield


app = FastAPI(title="Job Tracker API", version="0.1.0", lifespan=lifespan)

# Register rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Add TrustedHost middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "test"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.include_router(auth_router)
app.include_router(applications_router)
app.include_router(application_history_router)
app.include_router(rounds_router)
app.include_router(settings_router)
app.include_router(analytics_router)
app.include_router(admin_router)
app.include_router(export_router)
app.include_router(import_router)
app.include_router(files_router)
app.include_router(dashboard_router)
app.include_router(user_preferences_router)
app.include_router(streak_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
