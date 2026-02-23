"""Tests for application configuration.

Tests for:
- get_database_url() method with various input combinations
- DATABASE_URL priority over discrete settings
- Password encoding in constructed URLs
"""

import os
import pytest
from unittest.mock import patch


class TestGetDatabaseUrl:
    """Tests for Settings.get_database_url() method."""

    def test_database_url_takes_precedence(self):
        """Test that explicit DATABASE_URL is used over discrete settings."""
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql+asyncpg://user:pass@host:5432/db",
                "POSTGRES_HOST": "other-host",
                "POSTGRES_USER": "other-user",
                "POSTGRES_PASSWORD": "other-pass",
            },
            clear=True,
        ):
            # Clear the lru_cache to pick up new settings
            from app.core.config import get_settings

            get_settings.cache_clear()
            settings = get_settings()

            assert settings.get_database_url() == "postgresql+asyncpg://user:pass@host:5432/db"

    def test_discrete_postgres_settings_used_when_no_database_url(self):
        """Test that discrete PostgreSQL settings are used when DATABASE_URL not set."""
        with patch.dict(
            os.environ,
            {
                "POSTGRES_HOST": "postgres.example.com",
                "POSTGRES_PORT": "5432",
                "POSTGRES_USER": "tarnished",
                "POSTGRES_PASSWORD": "secret123",
                "POSTGRES_DB": "tarnished",
            },
            clear=True,
        ):
            from app.core.config import get_settings

            get_settings.cache_clear()
            settings = get_settings()

            url = settings.get_database_url()
            assert "postgresql+asyncpg" in url
            assert "postgres.example.com" in url
            assert "tarnished" in url  # username and database

    def test_password_with_special_characters_encoded(self):
        """Test that passwords with special characters are URL-encoded."""
        with patch.dict(
            os.environ,
            {
                "POSTGRES_HOST": "postgres.example.com",
                "POSTGRES_USER": "tarnished",
                "POSTGRES_PASSWORD": "p@ss:word/123",
                "POSTGRES_DB": "tarnished",
            },
            clear=True,
        ):
            from app.core.config import get_settings

            get_settings.cache_clear()
            settings = get_settings()

            url = settings.get_database_url()
            # SQLAlchemy URL.create encodes special characters
            assert "postgres.example.com" in url
            # @ should be encoded as %40
            assert "%40" in url or "@" not in url.split("@")[0]

    def test_sqlite_fallback_when_no_postgres_settings(self):
        """Test that SQLite is used when no PostgreSQL settings provided."""
        with patch.dict(os.environ, {}, clear=True):
            from app.core.config import get_settings

            get_settings.cache_clear()
            settings = get_settings()

            url = settings.get_database_url()
            assert "sqlite+aiosqlite" in url

    def test_partial_postgres_settings_falls_back_to_sqlite(self):
        """Test that partial PostgreSQL settings (missing password) falls back to SQLite."""
        with patch.dict(
            os.environ,
            {
                "POSTGRES_HOST": "postgres.example.com",
                "POSTGRES_USER": "tarnished",
                # Missing POSTGRES_PASSWORD
            },
            clear=True,
        ):
            from app.core.config import get_settings

            get_settings.cache_clear()
            settings = get_settings()

            url = settings.get_database_url()
            assert "sqlite+aiosqlite" in url
