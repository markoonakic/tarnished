import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeExportClient:
    def get_bytes(self, path, *, params=None, auth="jwt"):
        assert auth == "jwt"
        assert path in {"/api/export/json", "/api/export/csv", "/api/export/zip"}
        return (b"export-bytes", {"Content-Type": "application/octet-stream"})


def test_export_json_writes_file(runner, cli_config_dir, monkeypatch, tmp_path):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeExportClient(),
    )
    output = tmp_path / "export.json"

    result = runner.invoke(app, ["export", "json", "--output", str(output)])

    assert result.exit_code == 0
    assert output.read_bytes() == b"export-bytes"
