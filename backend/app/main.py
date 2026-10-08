import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.types import Scope

from app.api.admin import router as admin_router
from app.api.ai_settings import router as ai_settings_router
from app.api.analytics import router as analytics_router
from app.api.analytics_workspace import router as analytics_workspace_router
from app.api.application_history import router as application_history_router
from app.api.applications import router as applications_router
from app.api.attachments import router as attachments_router
from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.export import router as export_router
from app.api.files import router as files_router
from app.api.import_router import router as import_router
from app.api.insights import router as insights_router
from app.api.interview_feedback import router as interview_feedback_router
from app.api.job_leads import router as job_leads_router
from app.api.planning import router as planning_router
from app.api.profile import router as profile_router
from app.api.rounds import router as rounds_router
from app.api.settings import router as settings_router
from app.api.source_capture import router as source_capture_router
from app.api.streak import router as streak_router
from app.api.transcriptions import router as transcriptions_router
from app.api.user_preferences import router as user_preferences_router
from app.api.users import router as users_router
from app.api.workspace import router as workspace_router
from app.core.config import get_settings
from app.core.database import async_session_maker
from app.core.error_codes import error_code
from app.core.logging_config import setup_logging
from app.core.rate_limit import limiter
from app.core.seed import seed_defaults
from app.services.transcription_executor import TranscriptionExecutor

# Initialize structured logging
setup_logging()

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_session_maker() as db:
        await seed_defaults(db)
    executor = TranscriptionExecutor()
    app.state.transcription_executor = executor
    async with executor.lifespan():
        yield


app = FastAPI(title="Tarnished API", version="0.3.2", lifespan=lifespan)


@app.exception_handler(StarletteHTTPException)
async def coded_http_error(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": error_code(exc.status_code, exc.detail)},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def safe_account_validation(request: Request, exc: RequestValidationError):
    if request.url.path == "/api/admin/ai-settings":
        return JSONResponse(
            status_code=422,
            content={
                "code": "validation_error",
                "detail": "Invalid capability settings. Check field types, provider/model identifiers and absolute HTTP(S) endpoints.",
            },
        )
    # Pydantic includes raw input (possibly passwords) in its default API errors.
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "detail": [
                {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
                for error in exc.errors()
            ],
        },
    )


# Register rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Add CORS middleware
cors_origins = [origin.strip() for origin in settings.cors_origins.split(",")]
if settings.app_url and settings.app_url not in cors_origins:
    cors_origins.append(settings.app_url)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"(chrome-extension://.*|moz-extension://.*|extension://.*)",
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.get_trusted_hosts(),
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


from app.api.job_analyses import router as job_analyses_router

app.include_router(job_analyses_router)
app.include_router(planning_router)
app.include_router(attachments_router)
app.include_router(source_capture_router)
app.include_router(analytics_workspace_router)
app.include_router(workspace_router)
app.include_router(auth_router)
app.include_router(applications_router)
app.include_router(application_history_router)
app.include_router(profile_router)
app.include_router(rounds_router)
app.include_router(transcriptions_router)
app.include_router(interview_feedback_router)
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


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        if path == "api" or path.startswith("api/"):
            raise StarletteHTTPException(status_code=404)
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if (
                exc.status_code != 404
                or path in {"assets", "api"}
                or path.startswith(("assets/", "api/"))
            ):
                raise
            # The fallback must pass the same realpath containment as every file.
            return await super().get_response("index.html", scope)


# One static root also prevents an assets-directory symlink escaping the build.
static_dir = Path("static")
if static_dir.exists():
    app.mount("/", SPAStaticFiles(directory=static_dir), name="static-frontend")
