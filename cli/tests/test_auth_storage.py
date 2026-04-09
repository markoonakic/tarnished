from tarnished_cli.auth_storage import StoredAuth, load_auth, save_auth


def test_save_and_load_file_fallback_api_key(cli_config_dir):
    auth = StoredAuth(api_key="api-key-123")
    save_auth(auth, config_dir=cli_config_dir, prefer_keyring=False)

    loaded = load_auth(config_dir=cli_config_dir, prefer_keyring=False)

    assert loaded.api_key == "api-key-123"


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
