import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeDashboardClient:
    def get_json(self, path, *, params=None, auth="api_key"):
        if path == "/api/dashboard/kpis":
            return {"last_7_days": 3, "last_30_days": 10, "active_opportunities": 4}
        if path == "/api/dashboard/needs-attention":
            return {"follow_ups": [], "no_responses": [], "interviewing": []}
        if path == "/api/streak":
            return {"current_streak": 2, "longest_streak": 5}
        raise AssertionError(f"Unexpected GET path: {path}")


def test_dashboard_kpis_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeDashboardClient(),
    )

    result = runner.invoke(app, ["dashboard", "kpis"])

    assert result.exit_code == 0
    assert '"last_7_days": 3' in result.stdout
