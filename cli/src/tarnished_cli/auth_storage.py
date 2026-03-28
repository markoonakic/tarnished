from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path

import keyring
from keyring.errors import KeyringError, PasswordDeleteError
from pydantic import BaseModel

from tarnished_cli.config import resolve_config_dir

ACCESS_TOKEN_ENV = "TARNISHED_ACCESS_TOKEN"
REFRESH_TOKEN_ENV = "TARNISHED_REFRESH_TOKEN"
API_KEY_ENV = "TARNISHED_API_KEY"
KEYRING_SERVICE = "tarnished-cli"


class StoredAuth(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    api_key: str | None = None

    def is_empty(self) -> bool:
        return not any([self.access_token, self.refresh_token, self.api_key])


def resolve_auth_path(profile: str = "default", config_dir: Path | None = None) -> Path:
    return resolve_config_dir(config_dir) / f"auth-{profile}.json"


def _keyring_account(profile: str = "default", config_dir: Path | None = None) -> str:
    resolved_dir = resolve_config_dir(config_dir)
    return f"{resolved_dir}:{profile}"


def _env_auth() -> StoredAuth | None:
    access_token = os.getenv(ACCESS_TOKEN_ENV)
    refresh_token = os.getenv(REFRESH_TOKEN_ENV)
    api_key = os.getenv(API_KEY_ENV)
    if not any([access_token, refresh_token, api_key]):
        return None
    return StoredAuth(
        access_token=access_token,
        refresh_token=refresh_token,
        api_key=api_key,
    )


def _read_auth_file(path: Path) -> StoredAuth:
    if not path.exists():
        return StoredAuth()
    return StoredAuth.model_validate(json.loads(path.read_text()))


def _write_auth_file(path: Path, auth: StoredAuth) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.suppress(OSError):
        path.parent.chmod(0o700)
    path.write_text(json.dumps(auth.model_dump(mode="json"), sort_keys=True) + "\n")
    with contextlib.suppress(OSError):
        path.chmod(0o600)


def _remove_auth_file(path: Path) -> None:
    if path.exists():
        path.unlink()


def load_auth(
    profile: str = "default",
    *,
    config_dir: Path | None = None,
    prefer_keyring: bool = True,
) -> StoredAuth:
    env_auth = _env_auth()
    if env_auth is not None:
        return env_auth

    if prefer_keyring:
        account = _keyring_account(profile, config_dir)
        try:
            payload = keyring.get_password(KEYRING_SERVICE, account)
        except (KeyringError, RuntimeError):
            payload = None
        if payload:
            return StoredAuth.model_validate_json(payload)

    return _read_auth_file(resolve_auth_path(profile, config_dir))


def save_auth(
    auth: StoredAuth,
    profile: str = "default",
    *,
    config_dir: Path | None = None,
    prefer_keyring: bool = True,
) -> Path:
    path = resolve_auth_path(profile, config_dir)

    if prefer_keyring:
        account = _keyring_account(profile, config_dir)
        try:
            if auth.is_empty():
                with contextlib.suppress(PasswordDeleteError):
                    keyring.delete_password(KEYRING_SERVICE, account)
            else:
                keyring.set_password(
                    KEYRING_SERVICE, account, auth.model_dump_json(exclude_none=False)
                )
            _remove_auth_file(path)
            return path
        except (KeyringError, RuntimeError):
            pass

    _write_auth_file(path, auth)
    return path


def clear_auth(
    profile: str = "default",
    *,
    config_dir: Path | None = None,
    prefer_keyring: bool = True,
) -> None:
    path = resolve_auth_path(profile, config_dir)
    if prefer_keyring:
        account = _keyring_account(profile, config_dir)
        try:
            with contextlib.suppress(PasswordDeleteError):
                keyring.delete_password(KEYRING_SERVICE, account)
        except (KeyringError, RuntimeError):
            pass
    _remove_auth_file(path)
