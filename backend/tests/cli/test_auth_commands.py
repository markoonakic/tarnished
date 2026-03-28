import app.cli.state as state_module
from app.cli.auth_storage import load_auth as load_auth_impl
from app.cli.auth_storage import save_auth as save_auth_impl
from app.cli.main import app


class FakeLoginClient:
    def post_json(self, path, *, body, auth="jwt"):
        assert path == "/api/auth/login"
        assert auth == "none"
        assert body["email"] == "test@example.com"
        assert body["password"] == "testpass123"
        return {"access_token": "access-123", "refresh_token": "refresh-456"}


class FakeWhoamiClient:
    def get_json(self, path, *, params=None, auth="jwt"):
        assert path == "/api/auth/me"
        assert auth == "jwt"
        return {
            "id": "user-1",
            "email": "test@example.com",
            "is_admin": False,
            "is_active": True,
        }


def _load_auth_file_only(profile="default", *, config_dir=None):
    return load_auth_impl(profile, config_dir=config_dir, prefer_keyring=False)


def _save_auth_file_only(auth, profile="default", *, config_dir=None):
    return save_auth_impl(auth, profile, config_dir=config_dir, prefer_keyring=False)


def test_login_persists_tokens(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeLoginClient(),
    )

    result = runner.invoke(
        app,
        [
            "--base-url",
            "http://test",
            "auth",
            "login",
            "--email",
            "test@example.com",
            "--password",
            "testpass123",
        ],
    )

    assert result.exit_code == 0
    stored = load_auth_impl(config_dir=cli_config_dir, prefer_keyring=False)
    assert stored.access_token == "access-123"
    assert stored.refresh_token == "refresh-456"


def test_status_reports_logged_out(runner, cli_config_dir):
    result = runner.invoke(app, ["auth", "status"])

    assert result.exit_code == 0
    assert '"authenticated": false' in result.stdout.lower()


def test_whoami_returns_identity(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    save_auth_impl(
        state_module.StoredAuth(access_token="access-123", refresh_token="refresh-456"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeWhoamiClient(),
    )

    result = runner.invoke(app, ["auth", "whoami"])

    assert result.exit_code == 0
    assert '"email": "test@example.com"' in result.stdout
