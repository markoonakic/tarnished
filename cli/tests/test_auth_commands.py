import tarnished_cli.state as state_module
from tarnished_cli.auth_storage import load_auth as load_auth_impl
from tarnished_cli.auth_storage import save_auth as save_auth_impl
from tarnished_cli.main import app


def _load_auth_file_only(profile="default", *, config_dir=None):
    return load_auth_impl(profile, config_dir=config_dir, prefer_keyring=False)


def _save_auth_file_only(auth, profile="default", *, config_dir=None):
    return save_auth_impl(auth, profile, config_dir=config_dir, prefer_keyring=False)


def test_status_reports_logged_out(runner):
    result = runner.invoke(app, ["auth", "status"])

    assert result.exit_code == 0
    assert '"authenticated": false' in result.stdout.lower()


def test_status_reports_authenticated_when_api_key_exists(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    save_auth_impl(
        state_module.StoredAuth(api_key="api-key-123"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )

    result = runner.invoke(app, ["auth", "status"])

    assert result.exit_code == 0
    assert '"authenticated": true' in result.stdout.lower()
    assert '"has_api_key": true' in result.stdout.lower()


def test_api_key_set_persists_key(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)

    result = runner.invoke(
        app,
        ["auth", "api-key", "set", "--value", "api-key-123"],
    )

    assert result.exit_code == 0
    stored = load_auth_impl(config_dir=cli_config_dir, prefer_keyring=False)
    assert stored.api_key == "api-key-123"


def test_api_key_clear_removes_stored_key(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    save_auth_impl(
        state_module.StoredAuth(api_key="api-key-123"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )

    result = runner.invoke(app, ["auth", "api-key", "clear"])

    assert result.exit_code == 0
    stored = load_auth_impl(config_dir=cli_config_dir, prefer_keyring=False)
    assert stored.api_key is None
