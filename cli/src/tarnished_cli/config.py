from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

APP_NAME = "tarnished"
DEFAULT_BASE_URL = "http://127.0.0.1:5577"
CONFIG_DIR_ENV = "TARNISHED_CONFIG_DIR"
BASE_URL_ENV = "TARNISHED_BASE_URL"
OUTPUT_ENV = "TARNISHED_OUTPUT"


class ProfileConfig(BaseModel):
    base_url: str = DEFAULT_BASE_URL
    output: Literal["json", "text"] = "json"


class CliConfig(BaseModel):
    default_profile: str = "default"
    profiles: dict[str, ProfileConfig] = Field(
        default_factory=lambda: {"default": ProfileConfig()}
    )


def normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def resolve_config_dir(config_dir: Path | None = None) -> Path:
    if config_dir is not None:
        return config_dir.expanduser()

    explicit_dir = os.getenv(CONFIG_DIR_ENV)
    if explicit_dir:
        return Path(explicit_dir).expanduser()

    xdg_config_home = os.getenv("XDG_CONFIG_HOME")
    if xdg_config_home:
        return Path(xdg_config_home).expanduser() / APP_NAME

    return Path.home() / ".config" / APP_NAME


def resolve_config_path(config_dir: Path | None = None) -> Path:
    return resolve_config_dir(config_dir) / "config.json"


def load_config(config_dir: Path | None = None) -> CliConfig:
    path = resolve_config_path(config_dir)
    if path.exists():
        config = CliConfig.model_validate(json.loads(path.read_text(encoding="utf-8")))
    else:
        config = CliConfig()

    for profile_config in config.profiles.values():
        profile_config.base_url = normalize_base_url(profile_config.base_url)

    return config
