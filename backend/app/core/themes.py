"""
Theme color definitions for job-tracker.

This module provides theme color definitions that match the frontend CSS themes.
The get_theme_colors() function resolves a user's theme + accent choice into
actual hex values that will be sent to the extension.
"""

from typing import Dict

# Default theme and accent settings
DEFAULT_THEME = "gruvbox-dark"
DEFAULT_ACCENT = "aqua"

# Available accent color options
ACCENT_OPTIONS = ["aqua", "green", "blue", "purple", "yellow", "orange", "red"]

# Theme color definitions
THEMES = {
    "gruvbox-dark": {
        # Background layers (darkest to lightest)
        "bg0": "#1d2021",
        "bg1": "#282828",
        "bg2": "#3c3836",
        "bg3": "#504945",
        "bg4": "#665c54",
        # Foreground layers (lightest to darkest)
        "fg0": "#fbf1c7",
        "fg1": "#ebdbb2",
        "fg2": "#d5c4a1",
        "fg3": "#bdae93",
        "fg4": "#a89984",
        # Base colors
        "red": "#cc241d",
        "green": "#98971a",
        "yellow": "#d79921",
        "blue": "#458588",
        "purple": "#b16286",
        "aqua": "#689d6a",
        "orange": "#d65d0e",
        # Bright colors
        "red_bright": "#fb4934",
        "green_bright": "#b8bb26",
        "yellow_bright": "#fabd2f",
        "blue_bright": "#83a598",
        "purple_bright": "#d3869b",
        "aqua_bright": "#8ec07c",
        "orange_bright": "#fe8019",
    },
    "gruvbox-light": {
        # Background layers (darkest to lightest)
        "bg0": "#fbf1c7",
        "bg1": "#ebdbb2",
        "bg2": "#d5c4a1",
        "bg3": "#bdae93",
        "bg4": "#a89984",
        # Foreground layers (lightest to darkest)
        "fg0": "#1d2021",
        "fg1": "#282828",
        "fg2": "#3c3836",
        "fg3": "#504945",
        "fg4": "#665c54",
        # Base colors
        "red": "#9d0006",
        "green": "#79740e",
        "yellow": "#b57614",
        "blue": "#076678",
        "purple": "#8f3f71",
        "aqua": "#427b58",
        "orange": "#af3a03",
        # Bright colors
        "red_bright": "#cc241d",
        "green_bright": "#98971a",
        "yellow_bright": "#d79921",
        "blue_bright": "#458588",
        "purple_bright": "#b16286",
        "aqua_bright": "#689d6a",
        "orange_bright": "#d65d0e",
    },
    "catppuccin": {
        # Background layers (darkest to lightest)
        "bg0": "#11111b",
        "bg1": "#181825",
        "bg2": "#1e1e2e",
        "bg3": "#313244",
        "bg4": "#45475a",
        # Foreground layers (lightest to darkest)
        "fg0": "#cdd6f4",
        "fg1": "#bac2de",
        "fg2": "#a6adc8",
        "fg3": "#9399b2",
        "fg4": "#7f849c",
        # Base colors (bright same as base for catppuccin)
        "red": "#f38ba8",
        "green": "#a6e3a1",
        "yellow": "#f9e2af",
        "blue": "#89b4fa",
        "purple": "#cba6f7",
        "aqua": "#89dceb",
        "orange": "#fab387",
        # Bright colors (same as base)
        "red_bright": "#f38ba8",
        "green_bright": "#a6e3a1",
        "yellow_bright": "#f9e2af",
        "blue_bright": "#89b4fa",
        "purple_bright": "#cba6f7",
        "aqua_bright": "#89dceb",
        "orange_bright": "#fab387",
    },
    "dracula": {
        # Background layers (darkest to lightest)
        "bg0": "#0d0d14",
        "bg1": "#1a1a2e",
        "bg2": "#282a36",
        "bg3": "#44475a",
        "bg4": "#5a5d7a",
        # Foreground layers (lightest to darkest)
        "fg0": "#f8f8f2",
        "fg1": "#e6e6e6",
        "fg2": "#d1d1d1",
        "fg3": "#b0b0b0",
        "fg4": "#888888",
        # Base colors (bright same as base for dracula)
        "red": "#ff5555",
        "green": "#50fa7b",
        "yellow": "#f1fa8c",
        "blue": "#8be9fd",
        "purple": "#bd93f9",
        "aqua": "#8be9fd",
        "orange": "#ffb86c",
        # Bright colors (same as base)
        "red_bright": "#ff5555",
        "green_bright": "#50fa7b",
        "yellow_bright": "#f1fa8c",
        "blue_bright": "#8be9fd",
        "purple_bright": "#bd93f9",
        "aqua_bright": "#8be9fd",
        "orange_bright": "#ffb86c",
    },
}


def get_theme_colors(theme: str, accent: str) -> Dict[str, str]:
    """
    Get theme colors for the specified theme and accent color.

    Args:
        theme: Theme name (gruvbox-dark, gruvbox-light, catppuccin, dracula)
        accent: Accent color name (aqua, green, blue, purple, yellow, orange, red)

    Returns:
        Dict with: bg0-bg4, fg0-fg4, accent, accent_bright, red (bright), green (bright)
    """
    # Get theme colors, fallback to DEFAULT_THEME if not found
    theme_colors = THEMES.get(theme, THEMES[DEFAULT_THEME])

    # Resolve accent color, fallback to DEFAULT_ACCENT if not found
    if accent not in ACCENT_OPTIONS:
        accent = DEFAULT_ACCENT

    # Build result dict with required colors
    result = {
        # Background layers
        "bg0": theme_colors["bg0"],
        "bg1": theme_colors["bg1"],
        "bg2": theme_colors["bg2"],
        "bg3": theme_colors["bg3"],
        "bg4": theme_colors["bg4"],
        # Foreground layers
        "fg0": theme_colors["fg0"],
        "fg1": theme_colors["fg1"],
        "fg2": theme_colors["fg2"],
        "fg3": theme_colors["fg3"],
        "fg4": theme_colors["fg4"],
        # Accent colors
        "accent": theme_colors[accent],
        "accent_bright": theme_colors[f"{accent}_bright"],
        # Common colors for autofill indicators
        "red": theme_colors["red_bright"],
        "green": theme_colors["green_bright"],
    }

    return result
