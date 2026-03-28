import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeImportClient:
    def __init__(self):
        self.status_calls = 0

    def post_file_json(
        self,
        path,
        *,
        file_path,
        field_name="file",
        data=None,
        auth="jwt",
        content_type=None,
        allow_refresh=True,
    ):
        assert file_path.exists()
        assert auth == "jwt"
        if path == "/api/import/validate":
            return {"valid": True, "summary": {"applications": 1}, "errors": []}
        if path == "/api/import/import":
            return {"import_id": "import-123", "status": "processing"}
        raise AssertionError(f"Unexpected import POST path: {path}")

    def get_json(self, path, *, params=None, auth="jwt"):
        assert auth == "jwt"
        if path == "/api/import/status/import-123":
            self.status_calls += 1
            if self.status_calls == 1:
                return {"status": "pending", "stage": "importing", "percent": 50}
            return {
                "status": "complete",
                "success": True,
                "result": {"applications": 1, "rounds": 0, "status_history": 0},
            }
        raise AssertionError(f"Unexpected import GET path: {path}")


def test_import_validate_returns_json(runner, cli_config_dir, monkeypatch, tmp_path):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeImportClient(),
    )
    archive = tmp_path / "import.zip"
    archive.write_bytes(b"zip")

    result = runner.invoke(app, ["import", "validate", "--file", str(archive)])

    assert result.exit_code == 0
    assert '"valid": true' in result.stdout.lower()


def test_import_run_wait_polls_until_complete(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    fake_client = FakeImportClient()
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: fake_client,
    )
    archive = tmp_path / "import.zip"
    archive.write_bytes(b"zip")

    result = runner.invoke(
        app,
        [
            "import",
            "run",
            "--file",
            str(archive),
            "--wait",
            "--poll-interval",
            "0.0",
            "--timeout-seconds",
            "1.0",
        ],
    )

    assert result.exit_code == 0
    assert '"status": "complete"' in result.stdout
