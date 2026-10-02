import json

import pytest

from tarnished_cli.main import app


def test_invalid_config_is_a_safe_json_error(runner, cli_config_dir):
    (cli_config_dir / "config.json").write_text("invalid JSON")
    result = runner.invoke(app, ["--json", "auth", "status"])
    assert result.exit_code == 1
    assert "config directory" in json.loads(result.stdout)["error"]
    assert result.stderr == ""


def test_invalid_auth_does_not_echo_stored_credentials(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(
        "tarnished_cli.auth_storage.keyring.get_password", lambda *args: None
    )
    secret = "private-key-must-not-appear"
    (cli_config_dir / "auth-default.json").write_text(
        json.dumps({"api_key": {"secret": secret}})
    )
    result = runner.invoke(app, ["--json", "auth", "status"])
    assert result.exit_code == 1
    assert "stored API key" in json.loads(result.stdout)["error"]
    assert secret not in result.output


@pytest.mark.parametrize("kind", ["directory", "invalid_encoding"])
def test_unreadable_body_file_has_an_actionable_error(
    runner, cli_config_dir, tmp_path, kind
):
    path = tmp_path / "body.json"
    if kind == "directory":
        path.mkdir()
    else:
        path.write_bytes(b"\xff")
    result = runner.invoke(app, ["applications", "create", "--body-file", str(path)])
    assert result.exit_code == 2
    assert "readable UTF-8 JSON file" in result.output
