import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeJobLeadsClient:
    def get_json(self, path, *, params=None, auth="jwt"):
        if path == "/api/job-leads":
            assert params is not None
            assert auth == "flexible"
            return {
                "items": [],
                "total": 0,
                "page": params["page"],
                "per_page": params["per_page"],
            }
        if path == "/api/job-leads/lead-123":
            return {"id": "lead-123", "title": "CLI Role", "company": "Tarnished"}
        if path == "/api/job-leads/sources":
            return {"sources": ["LinkedIn"]}
        raise AssertionError(f"Unexpected GET path: {path}")

    def post_json(self, path, *, body, auth="jwt"):
        if path == "/api/job-leads":
            assert auth == "flexible"
            assert body["url"] == "https://example.com/job"
            return {"id": "lead-123", "title": "CLI Role", "company": "Tarnished"}
        if path == "/api/job-leads/lead-123/retry":
            assert auth == "jwt"
            return {"id": "lead-123", "status": "extracted"}
        if path == "/api/job-leads/lead-123/convert":
            assert auth == "flexible"
            return {"id": "app-123", "job_lead_id": "lead-123"}
        raise AssertionError(f"Unexpected POST path: {path}")

    def delete(self, path, *, auth="jwt"):
        assert auth == "jwt"
        assert path == "/api/job-leads/lead-123"


def test_job_leads_list_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeJobLeadsClient(),
    )

    result = runner.invoke(app, ["job-leads", "list"])

    assert result.exit_code == 0
    assert '"items"' in result.stdout


def test_job_leads_create_validates_body_file(runner, cli_config_dir):
    result = runner.invoke(app, ["job-leads", "create"])

    assert result.exit_code != 0
    combined = result.output + result.stderr
    assert "job-leads create" in combined.lower()


def test_job_leads_convert_calls_convert_endpoint(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeJobLeadsClient(),
    )

    result = runner.invoke(app, ["job-leads", "convert", "lead-123"])

    assert result.exit_code == 0
    assert '"job_lead_id": "lead-123"' in result.stdout


def test_job_leads_delete_requires_yes(runner, cli_config_dir):
    result = runner.invoke(app, ["job-leads", "delete", "lead-123"])

    assert result.exit_code != 0
    combined = result.output + result.stderr
    assert "job-leads delete" in combined.lower()
