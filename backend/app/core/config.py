import logging
import os

from functools import lru_cache

from pydantic_settings import BaseSettings
from sqlalchemy.engine import URL

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # Legacy: Full database URL (takes precedence if set)
    database_url: str | None = None

    # Discrete PostgreSQL settings (used if database_url not set)
    postgres_host: str | None = None
    postgres_port: int = 5432
    postgres_user: str | None = None
    postgres_password: str | None = None
    postgres_db: str = "tarnished"

    # SQLite fallback path
    sqlite_path: str = "./data/app.db"

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    upload_dir: str = "./uploads"
    admin_email: str | None = None
    max_document_size_mb: int = 10
    max_media_size_mb: int = 500
    cors_origins: str = "http://localhost:5173,http://localhost:5174"
    app_url: str = "http://localhost:5577"

    def get_database_url(self) -> str:
        """Build database URL with proper encoding.

        Priority:
        1. Explicit database_url (e.g., from Helm secret)
        2. PostgreSQL from discrete parts (URL.create handles encoding)
        3. SQLite fallback
        """
        if self.database_url:
            return self.database_url

        if all([self.postgres_host, self.postgres_user, self.postgres_password]):
            # SQLAlchemy URL.create handles URL encoding automatically
            return URL.create(
                drivername="postgresql+asyncpg",
                username=self.postgres_user,
                password=self.postgres_password,  # Raw password - SQLAlchemy encodes
                host=self.postgres_host,
                port=self.postgres_port,
                database=self.postgres_db,
            ).render_as_string(hide_password=False)

        # SQLite fallback
        return f"sqlite+aiosqlite:///{self.sqlite_path}"

    def model_post_init(self, __context: object) -> None:
        if self.secret_key == "change-me-in-production":
            if os.getenv("ENV", "development").lower() == "production":
                raise ValueError(
                    "SECRET_KEY must be changed from default in production"
                )
            logger.warning("Using default secret key — not suitable for production")

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
