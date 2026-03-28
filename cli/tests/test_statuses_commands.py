import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeStatusesClient:
    def get_json(self, path, *, params=None, auth="jwt"):
        assert path == "/api/statuses"
        assert auth == "flexible"
        return [{"id": "status-1", "name": "Applied"}]

    def post_json(self, path, *, body, auth="jwt"):
        assert path == "/api/statuses"
        assert auth == "jwt"
        assert body["name"] == "Applied"
        return {"id": "status-1", "name": "Applied"}

    def patch_json(self, path, *, body, auth="jwt"):
        assert path == "/api/statuses/status-1"
        assert auth == "jwt"
        return {"id": "status-1", "color": body["color"]}

    def delete(self, path, *, auth="jwt"):
        assert auth == "jwt"
        assert path == "/api/statuses/status-1"


def test_statuses_list_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeStatusesClient(),
    )

    result = runner.invoke(app, ["statuses", "list"])

    assert result.exit_code == 0
    assert '"name": "Applied"' in result.stdout


def test_statuses_create_posts_validated_body(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeStatusesClient(),
    )
    body_file = tmp_path / "status.json"
    body_file.write_text('{"name":"Applied","color":"#83a598"}')

    result = runner.invoke(app, ["statuses", "create", "--body-file", str(body_file)])

    assert result.exit_code == 0
    assert '"id": "status-1"' in result.stdout


def test_statuses_delete_requires_yes(runner, cli_config_dir):
    result = runner.invoke(app, ["statuses", "delete", "status-1"])

    assert result.exit_code != 0
    combined = result.output + result.stderr
    assert "--yes" in combined
