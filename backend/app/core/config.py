import logging
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

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

    secret_key: str  # Required: must be set via SECRET_KEY env var
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    upload_dir: str = "./uploads"
    admin_email: str | None = None
    max_document_size_mb: int = 10
    max_media_size_mb: int = 500
    cors_origins: str = "http://localhost:5173,http://localhost:5174"
    app_url: str = "http://localhost:5577"
    trusted_hosts: str = ""

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

    def get_trusted_hosts(self) -> list[str]:
        hosts: list[str] = ["localhost", "127.0.0.1", "test"]

        app_host = _normalize_host(self.app_url)
        if app_host:
            hosts.append(app_host)

        for raw_host in self.trusted_hosts.split(","):
            host = _normalize_host(raw_host)
            if host:
                hosts.append(host)

        deduped_hosts: list[str] = []
        for host in hosts:
            if host not in deduped_hosts:
                deduped_hosts.append(host)

        return deduped_hosts


def _normalize_host(value: str | None) -> str | None:
    if not value:
        return None

    raw = value.strip()
    if not raw:
        return None

    parsed = urlparse(raw if "://" in raw else f"//{raw}")
    return parsed.hostname or raw


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue] # pydantic-settings loads from env


def resolve_upload_path(stored_path: str) -> str:
    """Resolve a stored file path to a safe absolute filesystem path.

    Handles paths stored in the database which may have different formats:
    - 'uploads/hash.pdf' (canonical CAS format)
    - './uploads/hash.mp3' (legacy relative prefix)

    The resolved path must remain within the configured upload directory.

    Args:
        stored_path: Path as stored in database.

    Returns:
        Safe absolute path that can be used with os.path.exists(), FileResponse, etc.

    Raises:
        ValueError: If the resolved path escapes the configured upload root.
    """
    upload_root = Path(get_settings().upload_dir).resolve()

    path = stored_path
    if path.startswith("./"):
        path = path[2:]
    if path.startswith("uploads/"):
        path = path[8:]

    candidate = Path(path)
    resolved = (
        candidate.resolve()
        if candidate.is_absolute()
        else (upload_root / candidate).resolve()
    )

    try:
        resolved.relative_to(upload_root)
    except ValueError as exc:
        raise ValueError(
            f"Resolved upload path escapes upload root: {stored_path}"
        ) from exc

    return str(resolved)
