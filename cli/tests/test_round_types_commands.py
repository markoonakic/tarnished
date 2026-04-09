import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeRoundTypesClient:
    def get_json(self, path, *, params=None, auth="api_key"):
        assert path == "/api/round-types"
        assert auth == "api_key"
        return [{"id": "rt-1", "name": "Phone Screen"}]

    def post_json(self, path, *, body, auth="api_key"):
        assert path == "/api/round-types"
        assert auth == "api_key"
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
