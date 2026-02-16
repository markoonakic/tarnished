"""Tests for user settings endpoints.

Tests for:
- GET /api/users/settings - Get user theme settings with resolved colors
- PATCH /api/users/settings - Update user theme settings

All tests verify authentication requirements, success cases, and error handling.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.core.themes import DEFAULT_THEME, DEFAULT_ACCENT, THEMES, ACCENT_OPTIONS, get_theme_colors
from app.models import User


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    """Create a regular test user."""
    user = User(
        email="settings_test@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def test_user_with_settings(db: AsyncSession) -> User:
    """Create a user with existing settings."""
    user = User(
        email="settings_custom@example.com",
        password_hash=get_password_hash("testpass123"),
        is_admin=False,
        is_active=True,
        settings={"theme": "catppuccin", "accent": "blue"},
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    """Create Bearer token auth headers for a regular user."""
    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_with_settings(test_user_with_settings: User) -> dict[str, str]:
    """Create Bearer token auth headers for a user with settings."""
    token = create_access_token({"sub": test_user_with_settings.id})
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# GET /api/users/settings Tests
# ============================================================================


class TestGetSettings:
    """Tests for GET /api/users/settings endpoint."""

    async def test_get_settings_unauthenticated(self, client: AsyncClient):
        """Test that getting settings requires authentication."""
        response = await client.get("/api/users/settings")
        assert response.status_code == 401

    async def test_get_settings_default(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
    ):
        """Test getting default settings for user without custom settings."""
        response = await client.get("/api/users/settings", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        # Should return default theme and accent
        assert data["theme"] == DEFAULT_THEME
        assert data["accent"] == DEFAULT_ACCENT
        assert "colors" in data

    async def test_get_settings_returns_colors(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that response includes all required colors."""
        response = await client.get("/api/users/settings", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        colors = data["colors"]

        # Check all required color fields
        required_bg_colors = ["bg0", "bg1", "bg2", "bg3", "bg4"]
        required_fg_colors = ["fg0", "fg1", "fg2", "fg3", "fg4"]
        required_accent_colors = ["accent", "accent_bright"]
        required_status_colors = ["red", "green"]

        for color in required_bg_colors:
            assert color in colors, f"Missing color: {color}"
            assert colors[color].startswith("#"), f"{color} should be a hex color"

        for color in required_fg_colors:
            assert color in colors, f"Missing color: {color}"
            assert colors[color].startswith("#"), f"{color} should be a hex color"

        for color in required_accent_colors:
            assert color in colors, f"Missing color: {color}"
            assert colors[color].startswith("#"), f"{color} should be a hex color"

        for color in required_status_colors:
            assert color in colors, f"Missing color: {color}"
            assert colors[color].startswith("#"), f"{color} should be a hex color"

    async def test_get_settings_custom(
        self,
        client: AsyncClient,
        auth_headers_with_settings: dict,
    ):
        """Test getting custom settings for user with saved preferences."""
        response = await client.get("/api/users/settings", headers=auth_headers_with_settings)
        assert response.status_code == 200

        data = response.json()
        assert data["theme"] == "catppuccin"
        assert data["accent"] == "blue"
        assert "colors" in data


# ============================================================================
# PATCH /api/users/settings Tests
# ============================================================================


class TestUpdateSettings:
    """Tests for PATCH /api/users/settings endpoint."""

    async def test_update_settings_unauthenticated(self, client: AsyncClient):
        """Test that updating settings requires authentication."""
        response = await client.patch(
            "/api/users/settings",
            json={"theme": "dracula"},
        )
        assert response.status_code == 401

    async def test_update_settings_theme(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test updating theme setting."""
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers,
            json={"theme": "dracula"},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Settings updated"
        assert data["settings"]["theme"] == "dracula"

        # Verify it was saved to database
        await db.refresh(test_user)
        assert test_user.settings["theme"] == "dracula"

    async def test_update_settings_invalid_theme(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that invalid theme is rejected (400)."""
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers,
            json={"theme": "invalid-theme"},
        )
        assert response.status_code == 400

        error = response.json()
        assert "Invalid theme" in error["detail"]
        # Should list valid options
        assert "gruvbox-dark" in error["detail"]

    async def test_update_settings_accent(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test updating accent setting."""
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers,
            json={"accent": "purple"},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Settings updated"
        assert data["settings"]["accent"] == "purple"

        # Verify it was saved to database
        await db.refresh(test_user)
        assert test_user.settings["accent"] == "purple"

    async def test_update_settings_invalid_accent(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that invalid accent is rejected (400)."""
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers,
            json={"accent": "invalid-accent"},
        )
        assert response.status_code == 400

        error = response.json()
        assert "Invalid accent" in error["detail"]

    async def test_update_settings_both(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        db: AsyncSession,
    ):
        """Test updating both theme and accent at once."""
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers,
            json={"theme": "catppuccin", "accent": "green"},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["settings"]["theme"] == "catppuccin"
        assert data["settings"]["accent"] == "green"

        # Verify both were saved
        await db.refresh(test_user)
        assert test_user.settings["theme"] == "catppuccin"
        assert test_user.settings["accent"] == "green"

    async def test_update_settings_preserves_existing(
        self,
        client: AsyncClient,
        auth_headers_with_settings: dict,
        test_user_with_settings: User,
        db: AsyncSession,
    ):
        """Test that updating one setting preserves the other."""
        # User has theme=catppuccin, accent=blue
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers_with_settings,
            json={"accent": "orange"},  # Only update accent
        )
        assert response.status_code == 200

        data = response.json()
        # Theme should be preserved
        assert data["settings"]["theme"] == "catppuccin"
        assert data["settings"]["accent"] == "orange"


# ============================================================================
# Accent Resolution Tests
# ============================================================================


class TestAccentResolution:
    """Tests for accent color resolution per theme."""

    async def test_accent_resolution_per_theme(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
    ):
        """Test that accent colors resolve correctly per theme."""
        # Test each theme + accent combination
        for theme_name in THEMES:
            for accent_name in ACCENT_OPTIONS:
                # Update settings
                response = await client.patch(
                    "/api/users/settings",
                    headers=auth_headers,
                    json={"theme": theme_name, "accent": accent_name},
                )
                assert response.status_code == 200

                # Get settings and verify colors
                response = await client.get("/api/users/settings", headers=auth_headers)
                assert response.status_code == 200

                data = response.json()
                assert data["theme"] == theme_name
                assert data["accent"] == accent_name

                # Verify accent colors match expected values from theme
                colors = data["colors"]
                theme_colors = THEMES[theme_name]
                assert colors["accent"] == theme_colors[accent_name]
                assert colors["accent_bright"] == theme_colors[f"{accent_name}_bright"]

    async def test_gruvbox_dark_aqua_colors(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test specific color values for gruvbox-dark + aqua combination."""
        # Set gruvbox-dark theme with aqua accent
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers,
            json={"theme": "gruvbox-dark", "accent": "aqua"},
        )
        assert response.status_code == 200

        response = await client.get("/api/users/settings", headers=auth_headers)
        data = response.json()
        colors = data["colors"]

        # Verify expected gruvbox-dark values
        assert colors["bg0"] == "#1d2021"
        assert colors["bg1"] == "#282828"
        assert colors["fg0"] == "#fbf1c7"
        assert colors["accent"] == "#689d6a"  # aqua base
        assert colors["accent_bright"] == "#8ec07c"  # aqua bright

    async def test_catppuccin_blue_colors(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test specific color values for catppuccin + blue combination."""
        # Set catppuccin theme with blue accent
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers,
            json={"theme": "catppuccin", "accent": "blue"},
        )
        assert response.status_code == 200

        response = await client.get("/api/users/settings", headers=auth_headers)
        data = response.json()
        colors = data["colors"]

        # Verify expected catppuccin values
        assert colors["bg0"] == "#11111b"
        assert colors["bg1"] == "#181825"
        assert colors["fg0"] == "#cdd6f4"
        assert colors["accent"] == "#89b4fa"  # blue in catppuccin
        assert colors["accent_bright"] == "#89b4fa"  # same as base in catppuccin


# ============================================================================
# All Themes and Accents Availability Tests
# ============================================================================


class TestAllThemesAndAccents:
    """Tests verifying all themes and accents are available."""

    async def test_all_themes_are_valid(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that all defined themes can be set."""
        for theme_name in THEMES:
            response = await client.patch(
                "/api/users/settings",
                headers=auth_headers,
                json={"theme": theme_name},
            )
            assert response.status_code == 200, f"Failed to set theme: {theme_name}"

    async def test_all_accents_are_valid(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that all defined accents can be set."""
        for accent_name in ACCENT_OPTIONS:
            response = await client.patch(
                "/api/users/settings",
                headers=auth_headers,
                json={"accent": accent_name},
            )
            assert response.status_code == 200, f"Failed to set accent: {accent_name}"

    async def test_empty_update_is_valid(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test that empty update payload is accepted."""
        response = await client.patch(
            "/api/users/settings",
            headers=auth_headers,
            json={},
        )
        assert response.status_code == 200
