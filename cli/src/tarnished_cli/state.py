from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import typer

from tarnished_cli.auth_storage import StoredAuth, clear_auth, load_auth, save_auth
from tarnished_cli.client import TarnishedClient
from tarnished_cli.config import (
    CliConfig,
    load_config,
    normalize_base_url,
    resolve_config_dir,
)


@dataclass(slots=True)
class AppState:
    config: CliConfig
    config_dir: Path
    profile: str
    base_url: str
    json_output: bool
    verbose: bool
    tokens: StoredAuth

    @classmethod
    def load(
        cls,
        *,
        profile: str,
        base_url: str | None,
        json_output: bool,
        verbose: bool = False,
        config_dir: Path | None = None,
    ) -> AppState:
        resolved_dir = resolve_config_dir(config_dir)
        config = load_config(resolved_dir)
        profile_config = config.get_profile(profile)
        effective_base_url = normalize_base_url(base_url or profile_config.base_url)
        tokens = load_auth(profile, config_dir=resolved_dir)

        return cls(
            config=config,
            config_dir=resolved_dir,
            profile=profile,
            base_url=effective_base_url,
            json_output=json_output or profile_config.output == "json",
            verbose=verbose,
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

    def save_api_key(self, api_key: str | None) -> None:
        self.tokens.api_key = api_key
        save_auth(self.tokens, self.profile, config_dir=self.config_dir)

    def clear_all_auth(self) -> None:
        self.tokens = StoredAuth()
        clear_auth(self.profile, config_dir=self.config_dir)


def get_state(ctx: typer.Context) -> AppState:
    state = ctx.obj
    if not isinstance(state, AppState):
        raise RuntimeError("CLI state was not initialized.")
    return state
