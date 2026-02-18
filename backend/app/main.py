import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.admin import router as admin_router
from app.api.ai_settings import router as ai_settings_router
from app.api.analytics import router as analytics_router
from app.api.application_history import router as application_history_router
from app.api.applications import router as applications_router
from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.export import router as export_router
from app.api.files import router as files_router
from app.api.import_router import router as import_router
from app.api.insights import router as insights_router
from app.api.job_leads import router as job_leads_router
from app.api.profile import router as profile_router
from app.api.rounds import router as rounds_router
from app.api.settings import router as settings_router
from app.api.streak import router as streak_router
from app.api.user_preferences import router as user_preferences_router
from app.api.users import router as users_router
from app.core.config import get_settings
from app.core.database import async_session_maker
from app.core.logging_config import setup_logging
from app.core.rate_limit import limiter
from app.core.seed import seed_defaults

# Initialize structured logging
setup_logging()

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_session_maker() as db:
        await seed_defaults(db)
    yield


app = FastAPI(title="Tarnished API", version="0.1.0", lifespan=lifespan)

# Register rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Add CORS middleware
cors_origins = [origin.strip() for origin in settings.cors_origins.split(",")]
if settings.app_url and settings.app_url not in cors_origins:
    cors_origins.append(settings.app_url)


def cors_origin_validator(origin: str) -> bool:
    """Validate CORS origin, allowing browser extensions dynamically.

    Browser extension origins (chrome-extension://, moz-extension://) are
    dynamically generated based on the extension ID, so we allow them all.
    The extension ID is cryptographically tied to the extension, making this
    secure.

    Args:
        origin: The Origin header value from the request.

    Returns:
        True if the origin should be allowed, False otherwise.
    """
    # Allow browser extension origins
    extension_prefixes = ("chrome-extension://", "moz-extension://", "extension://")
    if origin.startswith(extension_prefixes):
        return True

    # Allow configured origins
    return origin in cors_origins


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"(chrome-extension://.*|moz-extension://.*|extension://.*|.*)",
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

# Add TrustedHost middleware - auto-include APP_URL hostname
allowed_hosts = ["localhost", "127.0.0.1", "test"]
if settings.app_url:
    parsed = urlparse(settings.app_url)
    if parsed.hostname and parsed.hostname not in allowed_hosts:
        allowed_hosts.append(parsed.hostname)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=allowed_hosts,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    # Basic security headers (always applied)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"

    # Content-Security-Policy for XSS protection
    # Note: 'unsafe-inline' needed for Tailwind CSS and inline styles
    # This CSP is appropriate for a SPA with API backend
    csp = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    response.headers["Content-Security-Policy"] = csp

    # HSTS only in production or when behind HTTPS proxy
    # Check X-Forwarded-Proto header (set by reverse proxies) or ENV
    is_https = request.headers.get("x-forwarded-proto", "").lower() == "https"
    is_production = os.getenv("ENV", "development").lower() == "production"
    if is_https or is_production:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

    return response


app.include_router(auth_router)
app.include_router(applications_router)
app.include_router(application_history_router)
app.include_router(profile_router)
app.include_router(rounds_router)
app.include_router(settings_router)
app.include_router(analytics_router)
app.include_router(admin_router)
app.include_router(export_router)
app.include_router(import_router)
app.include_router(job_leads_router)
app.include_router(files_router)
app.include_router(dashboard_router)
app.include_router(user_preferences_router)
app.include_router(streak_router)
app.include_router(ai_settings_router)
app.include_router(insights_router, prefix="/api/analytics", tags=["insights"])
app.include_router(users_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Serve static frontend files (production mode only)
# Only mount if the static directory exists (built frontend)
static_dir = Path("static")
if static_dir.exists():
    # Serve Vite assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory="static/assets"), name="static-assets")

    # SPA catch-all: serve index.html for all non-API, non-static routes
    @app.get("/{path:path}")
    async def serve_spa(path: str):
        file_path = static_dir / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse("static/index.html")
