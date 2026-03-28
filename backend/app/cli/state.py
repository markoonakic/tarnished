from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import typer

from app.cli.auth_storage import StoredAuth, clear_auth, load_auth, save_auth
from app.cli.client import TarnishedClient
from app.cli.config import (
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
        access_token = self.tokens.access_token if auth_required else self.tokens.access_token
        return TarnishedClient(
            base_url=self.base_url,
            access_token=access_token,
            refresh_token=self.tokens.refresh_token,
            api_key=self.tokens.api_key,
            on_token_refresh=self.save_tokens,
            transport=transport,  # type: ignore[arg-type]
        )

    def save_tokens(self, access_token: str, refresh_token: str) -> None:
        self.tokens.access_token = access_token
        self.tokens.refresh_token = refresh_token
        save_auth(self.tokens, self.profile, config_dir=self.config_dir)

    def clear_tokens(self) -> None:
        self.tokens.access_token = None
        self.tokens.refresh_token = None
        save_auth(self.tokens, self.profile, config_dir=self.config_dir)

    def clear_all_auth(self) -> None:
        self.tokens = StoredAuth()
        clear_auth(self.profile, config_dir=self.config_dir)


def get_state(ctx: typer.Context) -> AppState:
    state = ctx.obj
    if not isinstance(state, AppState):
        raise RuntimeError("CLI state was not initialized.")
    return state
