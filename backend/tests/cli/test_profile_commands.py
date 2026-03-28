import app.cli.state as state_module
from app.cli.main import app


class FakeProfileClient:
    def get_json(self, path, *, params=None, auth="jwt"):
        assert path == "/api/profile"
        assert auth == "flexible"
        return {"user_id": "user-1", "email": "test@example.com"}

    def put_json(self, path, *, body, auth="jwt"):
        assert path == "/api/profile"
        assert auth == "jwt"
        assert body["first_name"] == "Marko"
        return {"user_id": "user-1", "first_name": "Marko"}


def test_profile_get_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeProfileClient(),
    )

    result = runner.invoke(app, ["profile", "get"])

    assert result.exit_code == 0
    assert '"user_id": "user-1"' in result.stdout


def test_profile_update_validates_body_file(runner, cli_config_dir):
    result = runner.invoke(app, ["profile", "update"])

    assert result.exit_code != 0
    combined = result.output + result.stderr
    assert "--body-file" in combined
