import logging
import os

from pydantic_settings import BaseSettings
from functools import lru_cache

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./data/app.db"
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
