from app.cli.auth_storage import StoredAuth, load_auth, save_auth


def test_save_and_load_file_fallback_auth(cli_config_dir):
    auth = StoredAuth(access_token="a", refresh_token="r", api_key=None)
    save_auth(auth, config_dir=cli_config_dir, prefer_keyring=False)

    loaded = load_auth(config_dir=cli_config_dir, prefer_keyring=False)

    assert loaded.access_token == "a"
    assert loaded.refresh_token == "r"


def test_env_auth_overrides_stored_auth(monkeypatch, cli_config_dir):
    auth = StoredAuth(access_token="file-a", refresh_token="file-r", api_key=None)
    save_auth(auth, config_dir=cli_config_dir, prefer_keyring=False)
    monkeypatch.setenv("TARNISHED_ACCESS_TOKEN", "env-a")
    monkeypatch.setenv("TARNISHED_REFRESH_TOKEN", "env-r")

    loaded = load_auth(config_dir=cli_config_dir, prefer_keyring=False)

    assert loaded.access_token == "env-a"
    assert loaded.refresh_token == "env-r"
