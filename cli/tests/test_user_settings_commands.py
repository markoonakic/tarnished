import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeUserSettingsClient:
    def get_json(self, path, *, params=None, auth="api_key"):
        if path == "/api/users/settings":
            return {"theme": "gruvbox-dark", "accent": "aqua", "colors": {}}
        if path == "/api/user-preferences":
            return {
                "show_streak_stats": True,
                "show_needs_attention": True,
                "show_heatmap": True,
                "time_zone_mode": "manual",
                "time_zone": "Europe/Belgrade",
            }
        raise AssertionError(f"Unexpected GET path: {path}")

    def patch_json(self, path, *, body, auth="api_key"):
        if path == "/api/users/settings":
            return {"message": "Settings updated", "settings": body}
        if path == "/api/user-preferences":
            return {
                "show_streak_stats": body.get("show_streak_stats", True),
                "show_needs_attention": body.get("show_needs_attention", True),
                "show_heatmap": body.get("show_heatmap", True),
                "time_zone_mode": body.get(
                    "time_zone_mode",
                    "manual" if body.get("time_zone") is not None else "device",
                ),
                "time_zone": body.get("time_zone"),
            }
        raise AssertionError(f"Unexpected PATCH path: {path}")


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
    assert '"time_zone_mode": "manual"' in result.stdout.lower()
    assert '"time_zone": "europe/belgrade"' in result.stdout.lower()


def test_preferences_update_accepts_time_zone(runner, cli_config_dir, monkeypatch, tmp_path):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeUserSettingsClient(),
    )

    body_file = tmp_path / "preferences.json"
    body_file.write_text('{"time_zone": "America/New_York"}')

    result = runner.invoke(
        app,
        ["preferences", "update", "--body-file", str(body_file)],
    )

    assert result.exit_code == 0
    assert '"time_zone_mode": "manual"'.lower() in result.stdout.lower()
    assert '"time_zone": "America/New_York"'.lower() in result.stdout.lower()
