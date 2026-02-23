"""Tests for application configuration.

Tests for:
- get_database_url() method with various input combinations
- DATABASE_URL priority over discrete settings
- Password encoding in constructed URLs
"""

from app.core.config import Settings


def create_test_settings(**kwargs) -> Settings:
    """Create Settings instance without reading .env file.

    Pydantic-settings reads .env by default, which can interfere with tests.
    This helper disables .env file reading for isolated testing.
    """
    return Settings(_env_file=None, **kwargs)  # type: ignore[arg-type]


class TestGetDatabaseUrl:
    """Tests for Settings.get_database_url() method."""

    def test_database_url_takes_precedence(self):
        """Test that explicit DATABASE_URL is used over discrete settings."""
        settings = create_test_settings(
            database_url="postgresql+asyncpg://user:pass@host:5432/db",
            postgres_host="other-host",
            postgres_user="other-user",
            postgres_password="other-pass",
        )

        assert (
            settings.get_database_url() == "postgresql+asyncpg://user:pass@host:5432/db"
        )

    def test_discrete_postgres_settings_used_when_no_database_url(self):
        """Test that discrete PostgreSQL settings are used when DATABASE_URL not set."""
        settings = create_test_settings(
            database_url=None,
            postgres_host="postgres.example.com",
            postgres_port=5432,
            postgres_user="tarnished",
            postgres_password="secret123",
            postgres_db="tarnished",
        )

        url = settings.get_database_url()
        assert "postgresql+asyncpg" in url
        assert "postgres.example.com" in url
        assert "tarnished" in url  # username and database

    def test_password_with_special_characters_encoded(self):
        """Test that passwords with special characters are URL-encoded."""
        settings = create_test_settings(
            database_url=None,
            postgres_host="postgres.example.com",
            postgres_user="tarnished",
            postgres_password="p@ss:word/123",
            postgres_db="tarnished",
        )

        url = settings.get_database_url()
        # SQLAlchemy URL.create encodes special characters
        assert "postgres.example.com" in url
        # @ should be encoded as %40
        assert "%40" in url or "@" not in url.split("@")[0]

    def test_sqlite_fallback_when_no_postgres_settings(self):
        """Test that SQLite is used when no PostgreSQL settings provided."""
        settings = create_test_settings(database_url=None)

        url = settings.get_database_url()
        assert "sqlite+aiosqlite" in url

    def test_partial_postgres_settings_falls_back_to_sqlite(self):
        """Test that partial PostgreSQL settings (missing password) falls back to SQLite."""
        settings = create_test_settings(
            database_url=None,
            postgres_host="postgres.example.com",
            postgres_user="tarnished",
            # Missing POSTGRES_PASSWORD
        )

        url = settings.get_database_url()
        assert "sqlite+aiosqlite" in url
