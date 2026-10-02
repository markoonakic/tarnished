import os
import stat
from pathlib import Path

import pytest

from tarnished_cli.auth_storage import (
    StoredAuth,
    load_auth,
    resolve_auth_path,
    save_auth,
)
from tarnished_cli.client import CLIError


def test_save_and_load_file_fallback_api_key(cli_config_dir):
    auth = StoredAuth(api_key="api-key-123")
    save_auth(auth, config_dir=cli_config_dir, prefer_keyring=False)

    loaded = load_auth(config_dir=cli_config_dir, prefer_keyring=False)

    assert loaded.api_key == "api-key-123"


@pytest.mark.skipif(os.name != "posix", reason="POSIX file permissions")
def test_file_fallback_sets_private_permissions(cli_config_dir):
    path = save_auth(
        StoredAuth(api_key="private-key"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_file_fallback_keeps_old_key_when_replacement_fails(
    monkeypatch, cli_config_dir
):
    save_auth(
        StoredAuth(api_key="old-key"), config_dir=cli_config_dir, prefer_keyring=False
    )

    def fail_replace(self, target):
        raise OSError("disk failure")

    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(CLIError, match="Could not save API key"):
        save_auth(
            StoredAuth(api_key="new-key"),
            config_dir=cli_config_dir,
            prefer_keyring=False,
        )
    assert (
        load_auth(config_dir=cli_config_dir, prefer_keyring=False).api_key == "old-key"
    )
    assert not list(cli_config_dir.glob(".tarnished-*"))


@pytest.mark.skipif(os.name != "posix", reason="POSIX directory permissions")
def test_credentials_are_written_in_a_private_temporary_directory(
    monkeypatch, cli_config_dir
):
    original = Path.write_bytes

    def check_write(path, content):
        assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
        assert path != resolve_auth_path(config_dir=cli_config_dir)
        return original(path, content)

    monkeypatch.setattr(Path, "write_bytes", check_write)
    save_auth(
        StoredAuth(api_key="private-key"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )


def test_env_auth_overrides_stored_api_key(monkeypatch, cli_config_dir):
    auth = StoredAuth(api_key="file-key")
    save_auth(auth, config_dir=cli_config_dir, prefer_keyring=False)
    monkeypatch.setenv("TARNISHED_API_KEY", "env-key")

    loaded = load_auth(config_dir=cli_config_dir, prefer_keyring=False)

    assert loaded.api_key == "env-key"


def test_keyring_auth_is_namespaced_by_config_dir(monkeypatch, tmp_path):
    store: dict[tuple[str, str], str] = {}

    def fake_get_password(service: str, account: str) -> str | None:
        return store.get((service, account))

    def fake_set_password(service: str, account: str, password: str) -> None:
        store[(service, account)] = password

    def fake_delete_password(service: str, account: str) -> None:
        store.pop((service, account), None)

    monkeypatch.setattr(
        "tarnished_cli.auth_storage.keyring.get_password", fake_get_password
    )
    monkeypatch.setattr(
        "tarnished_cli.auth_storage.keyring.set_password", fake_set_password
    )
    monkeypatch.setattr(
        "tarnished_cli.auth_storage.keyring.delete_password", fake_delete_password
    )

    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    save_auth(StoredAuth(api_key="token-a"), config_dir=first_dir)

    loaded_first = load_auth(config_dir=first_dir)
    loaded_second = load_auth(config_dir=second_dir)

    assert loaded_first.api_key == "token-a"
    assert loaded_second.api_key is None
