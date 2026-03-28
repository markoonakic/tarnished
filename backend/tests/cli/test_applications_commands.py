import app.cli.state as state_module
from app.cli.main import app


class FakeApplicationsClient:
    def get_json(self, path, *, params=None, auth="jwt"):
        if path == "/api/applications":
            assert params is not None
            assert auth == "flexible"
            return {"items": [], "total": 0, "page": params["page"], "per_page": params["per_page"]}
        if path == "/api/applications/app-123":
            return {"id": "app-123", "company": "Tarnished", "job_title": "CLI Engineer"}
        if path == "/api/applications/sources":
            return {"sources": ["LinkedIn"]}
        if path == "/api/applications/app-123/history":
            return [{"id": "hist-1"}]
        raise AssertionError(f"Unexpected GET path: {path}")

    def post_json(self, path, *, body, auth="jwt"):
        assert path == "/api/applications"
        assert auth == "flexible"
        assert body["company"] == "Tarnished"
        return {"id": "app-123", "company": body["company"], "job_title": body["job_title"]}

    def patch_json(self, path, *, body, auth="jwt"):
        assert path == "/api/applications/app-123"
        assert auth == "jwt"
        assert body["location"] == "Remote"
        return {"id": "app-123", "location": "Remote"}

    def delete(self, path, *, auth="jwt"):
        assert auth == "jwt"
        assert path in {
            "/api/applications/app-123",
            "/api/applications/app-123/history/hist-1",
        }


def test_applications_list_emits_json(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeApplicationsClient(),
    )

    result = runner.invoke(app, ["applications", "list"])

    assert result.exit_code == 0
    assert '"items"' in result.stdout


def test_applications_get_hits_detail_endpoint(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeApplicationsClient(),
    )

    result = runner.invoke(app, ["applications", "get", "app-123"])

    assert result.exit_code == 0
    assert '"id": "app-123"' in result.stdout


def test_applications_create_requires_body_file(runner, cli_config_dir):
    result = runner.invoke(app, ["applications", "create"])

    assert result.exit_code != 0
    combined = result.output + result.stderr
    assert "--body-file" in combined


def test_applications_create_posts_validated_body(runner, cli_config_dir, monkeypatch, tmp_path):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeApplicationsClient(),
    )
    body_file = tmp_path / "application.json"
    body_file.write_text(
        '{"company":"Tarnished","job_title":"CLI Engineer","status_id":"status-1"}'
    )

    result = runner.invoke(
        app,
        ["applications", "create", "--body-file", str(body_file)],
    )

    assert result.exit_code == 0
    assert '"company": "Tarnished"' in result.stdout


def test_applications_delete_requires_yes(runner, cli_config_dir):
    result = runner.invoke(app, ["applications", "delete", "app-123"])

    assert result.exit_code != 0
    combined = result.output + result.stderr
    assert "--yes" in combined
