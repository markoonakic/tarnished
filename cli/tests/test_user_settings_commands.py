import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeUserSettingsClient:
    def get_json(self, path, *, params=None, auth="jwt"):
        if path == "/api/users/settings":
            return {"theme": "gruvbox-dark", "accent": "aqua", "colors": {}}
        if path == "/api/user-preferences":
            return {
                "show_streak_stats": True,
                "show_needs_attention": True,
                "show_heatmap": True,
            }
        raise AssertionError(f"Unexpected GET path: {path}")

    def patch_json(self, path, *, body, auth="jwt"):
        assert path == "/api/users/settings"
        return {"message": "Settings updated", "settings": body}

    def put_json(self, path, *, body, auth="jwt"):
        assert path == "/api/user-preferences"
        return {
            "show_streak_stats": body.get("show_streak_stats", True),
            "show_needs_attention": body.get("show_needs_attention", True),
            "show_heatmap": body.get("show_heatmap", True),
        }


def test_user_settings_get_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeUserSettingsClient(),
    )

    result = runner.invoke(app, ["user-settings", "get"])

    assert result.exit_code == 0
    assert '"theme": "gruvbox-dark"' in result.stdout


def test_preferences_get_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeUserSettingsClient(),
    )

    result = runner.invoke(app, ["preferences", "get"])

    assert result.exit_code == 0
    assert '"show_streak_stats": true' in result.stdout.lower()
