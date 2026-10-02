from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import typer

from tarnished_cli.auth_storage import StoredAuth, clear_auth, load_auth, save_auth
from tarnished_cli.client import TarnishedClient
from tarnished_cli.config import (
    BASE_URL_ENV,
    OUTPUT_ENV,
    ProfileConfig,
    load_config,
    normalize_base_url,
    resolve_config_dir,
)


@dataclass(slots=True)
class AppState:
    config_dir: Path
    profile: str
    base_url: str
    json_output: bool
    tokens: StoredAuth

    @classmethod
    def load(
        cls,
        *,
        profile: str | None,
        base_url: str | None,
        json_output: bool,
        config_dir: Path | None = None,
    ) -> AppState:
        resolved_dir = resolve_config_dir(config_dir)
        config = load_config(resolved_dir)
        profile = profile if profile is not None else config.default_profile
        profile_config = config.profiles.get(profile, ProfileConfig())
        effective_base_url = normalize_base_url(
            base_url or os.getenv(BASE_URL_ENV) or profile_config.base_url
        )
        env_output = os.getenv(OUTPUT_ENV)
        output = env_output if env_output in {"json", "text"} else profile_config.output
        tokens = load_auth(profile, config_dir=resolved_dir)

        return cls(
            config_dir=resolved_dir,
            profile=profile,
            base_url=effective_base_url,
            json_output=json_output or output == "json",
            tokens=tokens,
        )

    def build_client(
        self,
        *,
        auth_required: bool = True,
        transport: object | None = None,
    ) -> TarnishedClient:
        return TarnishedClient(
            base_url=self.base_url,
            api_key=self.tokens.api_key if auth_required else None,
            transport=transport,  # type: ignore[arg-type]
        )

    def save_api_key(self, api_key: str) -> None:
        auth = StoredAuth(api_key=api_key)
        save_auth(auth, self.profile, config_dir=self.config_dir)
        self.tokens = auth

    def clear_api_key(self) -> None:
        clear_auth(self.profile, config_dir=self.config_dir)
        self.tokens = StoredAuth()


def get_state(ctx: typer.Context) -> AppState:
    state = ctx.obj
    if not isinstance(state, AppState):
        raise RuntimeError("CLI state was not initialized.")
    return state
