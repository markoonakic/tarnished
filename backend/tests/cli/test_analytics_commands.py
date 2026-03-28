import app.cli.state as state_module
from app.cli.main import app


class FakeAnalyticsClient:
    def get_json(self, path, *, params=None, auth="jwt"):
        if path == "/api/analytics/kpis":
            assert params is not None
            assert params["period"] == "30d"
            return {"total_applications": 10, "interviews": 2, "offers": 1}
        if path == "/api/analytics/heatmap":
            return {"days": [], "max_count": 0}
        if path == "/api/analytics/weekly":
            return []
        if path == "/api/analytics/sankey":
            return {"nodes": [], "links": []}
        if path == "/api/analytics/interview-rounds":
            return {
                "funnel": [],
                "outcomes": [],
                "timeline": [],
                "candidate_progress": [],
            }
        if path == "/api/analytics/insights/configured":
            return {"configured": True}
        raise AssertionError(f"Unexpected GET path: {path}")

    def post_json(self, path, *, body, auth="jwt"):
        assert path == "/api/analytics/insights"
        assert body["period"] == "30d"
        return {
            "overall_grace": "Strong pipeline momentum.",
            "pipeline_overview": {
                "key_insight": "Applications are converting.",
                "trend": "up",
                "priority_actions": ["Keep applying"],
                "pattern": None,
            },
            "interview_analytics": {
                "key_insight": "Interview rate is stable.",
                "trend": "flat",
                "priority_actions": ["Sharpen stories"],
                "pattern": None,
            },
            "activity_tracking": {
                "key_insight": "Consistency is improving.",
                "trend": "up",
                "priority_actions": ["Maintain streak"],
                "pattern": None,
            },
        }


def test_analytics_kpis_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeAnalyticsClient(),
    )

    result = runner.invoke(app, ["analytics", "kpis"])

    assert result.exit_code == 0
    assert '"total_applications": 10' in result.stdout


def test_analytics_insights_configured_emits_json(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeAnalyticsClient(),
    )

    result = runner.invoke(app, ["analytics", "insights-configured"])

    assert result.exit_code == 0
    assert '"configured": true' in result.stdout.lower()
