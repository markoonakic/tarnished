import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeApplicationsClient:
    def get_json(self, path, *, params=None, auth="api_key"):
        if path == "/api/applications":
            assert params is not None
            assert auth == "api_key"
            return {
                "items": [],
                "total": 0,
                "page": params["page"],
                "per_page": params["per_page"],
            }
        if path == "/api/applications/app-123":
            return {
                "id": "app-123",
                "company": "Tarnished",
                "job_title": "CLI Engineer",
            }
        if path == "/api/applications/sources":
            return {"sources": ["LinkedIn"]}
        if path == "/api/applications/app-123/history":
            return [{"id": "hist-1"}]
        if path in {
            "/api/files/app-123/cv/signed",
            "/api/files/app-123/cover-letter/signed",
        }:
            return {"url": "/signed/file", "expires_in": 300}
        raise AssertionError(f"Unexpected GET path: {path}")

    def post_json(self, path, *, body, auth="api_key"):
        if path == "/api/applications":
            assert auth == "api_key"
            assert body["company"] == "Tarnished"
            return {
                "id": "app-123",
                "company": body["company"],
                "job_title": body["job_title"],
            }
        if path == "/api/applications/extract":
            assert auth == "api_key"
            assert body["url"] == "https://example.com/job"
            return {
                "id": "app-123",
                "company": "Tarnished",
                "job_title": "Extracted Role",
            }
        raise AssertionError(f"Unexpected POST path: {path}")

    def patch_json(self, path, *, body, auth="api_key"):
        assert path == "/api/applications/app-123"
        assert auth == "api_key"
        assert body["location"] == "Remote"
        return {"id": "app-123", "location": "Remote"}

    def delete(self, path, *, auth="api_key"):
        assert auth == "api_key"
        assert path in {
            "/api/applications/app-123",
            "/api/applications/app-123/history/hist-1",
        }

    def delete_json(self, path, *, auth="api_key"):
        assert auth == "api_key"
        assert path in {
            "/api/applications/app-123/cv",
            "/api/applications/app-123/cover-letter",
        }
        return {"id": "app-123", "cv_path": None, "cover_letter_path": None}

    def post_file_json(
        self,
        path,
        *,
        file_path,
        field_name="file",
        auth="api_key",
        content_type=None,
        allow_refresh=True,
    ):
        assert auth == "api_key"
        assert field_name == "file"
        assert file_path.exists()
        assert path in {
            "/api/applications/app-123/cv",
            "/api/applications/app-123/cover-letter",
        }
        return {
            "id": "app-123",
            "cv_path": "uploads/file.bin",
            "cover_letter_path": "uploads/file.bin",
        }

    def get_bytes(self, path, *, params=None, auth="api_key"):
        assert auth == "api_key"
        assert path in {
            "/api/files/app-123/cv",
            "/api/files/app-123/cover-letter",
        }
        return (b"document-bytes", {"Content-Type": "application/pdf"})


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
    assert "applications create" in combined.lower()


def test_applications_create_posts_validated_body(
    runner, cli_config_dir, monkeypatch, tmp_path
):
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
    assert "applications delete" in combined.lower()


def test_applications_cv_upload_posts_file(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeApplicationsClient(),
    )
    resume = tmp_path / "resume.pdf"
    resume.write_bytes(b"%PDF-1.4")

    result = runner.invoke(
        app,
        ["applications", "cv", "upload", "app-123", "--file", str(resume)],
    )

    assert result.exit_code == 0
    assert '"id": "app-123"' in result.stdout


def test_applications_cv_download_writes_file(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeApplicationsClient(),
    )
    output = tmp_path / "resume.pdf"

    result = runner.invoke(
        app,
        ["applications", "cv", "download", "app-123", "--output", str(output)],
    )

    assert result.exit_code == 0
    assert output.read_bytes() == b"document-bytes"


def test_applications_extract_posts_validated_body(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeApplicationsClient(),
    )
    body_file = tmp_path / "extract.json"
    body_file.write_text(
        '{"url":"https://example.com/job","status_id":"status-1","text":"source text"}'
    )

    result = runner.invoke(
        app,
        ["applications", "extract", "--body-file", str(body_file)],
    )

    assert result.exit_code == 0
    assert '"job_title": "Extracted Role"' in result.stdout
