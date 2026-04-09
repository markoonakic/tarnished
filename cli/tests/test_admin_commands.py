import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeAdminClient:
    def get_json(self, path, *, params=None, auth="api_key"):
        if path == "/api/admin/stats":
            return {
                "total_users": 10,
                "active_users": 8,
                "total_applications": 120,
                "applications_this_month": 14,
            }
        if path == "/api/admin/users":
            return {"items": [{"id": "u1", "email": "user@example.com"}], "total": 1}
        if path == "/api/admin/applications":
            return {"items": [{"id": "app-1"}], "total": 1, "page": 1, "per_page": 20}
        if path == "/api/admin/ai-settings":
            return {
                "litellm_model": "gpt-4o",
                "litellm_api_key_masked": "...1234",
                "litellm_base_url": "https://api.example.com",
                "is_configured": True,
            }
        raise AssertionError(f"Unexpected admin GET path: {path}")

    def post_json(self, path, *, body, auth="api_key"):
        assert path == "/api/admin/users"
        assert body["email"] == "new@example.com"
        return {"id": "u2", "email": body["email"]}

    def patch_json(self, path, *, body, auth="api_key"):
        if path == "/api/admin/users/u1":
            return {
                "id": "u1",
                "email": "user@example.com",
                "is_active": body["is_active"],
            }
        if path == "/api/admin/statuses/status-1":
            return {"id": "status-1", "name": body.get("name", "Applied")}
        if path == "/api/admin/round-types/rt-1":
            return {"id": "rt-1", "name": body.get("name", "Phone Screen")}
        raise AssertionError(f"Unexpected admin PATCH path: {path}")

    def put_json(self, path, *, body, auth="api_key"):
        assert path == "/api/admin/ai-settings"
        return {
            "litellm_model": body["litellm_model"],
            "litellm_api_key_masked": "...4321",
            "litellm_base_url": body["litellm_base_url"],
            "is_configured": True,
        }

    def delete(self, path, *, auth="api_key"):
        assert path == "/api/admin/users/u1"


def test_admin_stats_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeAdminClient(),
    )

    result = runner.invoke(app, ["admin", "stats"])

    assert result.exit_code == 0
    assert '"total_users": 10' in result.stdout


def test_admin_users_list_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeAdminClient(),
    )

    result = runner.invoke(app, ["admin", "users", "list"])

    assert result.exit_code == 0
    assert '"email": "user@example.com"' in result.stdout


def test_admin_ai_settings_get_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeAdminClient(),
    )

    result = runner.invoke(app, ["admin", "ai-settings", "get"])

    assert result.exit_code == 0
    assert '"litellm_model": "gpt-4o"' in result.stdout
