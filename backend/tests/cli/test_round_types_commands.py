import app.cli.state as state_module
from app.cli.main import app


class FakeRoundTypesClient:
    def get_json(self, path, *, params=None, auth="jwt"):
        assert path == "/api/round-types"
        assert auth == "jwt"
        return [{"id": "rt-1", "name": "Phone Screen"}]

    def post_json(self, path, *, body, auth="jwt"):
        assert path == "/api/round-types"
        assert auth == "jwt"
        assert body["name"] == "Phone Screen"
        return {"id": "rt-1", "name": "Phone Screen"}


def test_round_types_list_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeRoundTypesClient(),
    )

    result = runner.invoke(app, ["round-types", "list"])

    assert result.exit_code == 0
    assert '"name": "Phone Screen"' in result.stdout
