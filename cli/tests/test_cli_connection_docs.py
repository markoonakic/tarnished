"""Execute this guide's CLI examples, not its network-dependent installers."""

import json
import re
import shlex
from pathlib import Path

import httpx

import tarnished_cli.state as state_module
from tarnished_cli.auth_diagnostics import CLI_REQUIRED_SCOPES
from tarnished_cli.auth_storage import save_auth
from tarnished_cli.config import CliConfig
from tarnished_cli.main import app


def test_use_the_cli_guide_examples(
    runner, cli_config_dir, mock_server, monkeypatch, tmp_path, write_cli_config
):
    guide = (
        Path(__file__).parents[2] / "documentation/content/how-to/use-the-cli.md"
    ).read_text()
    guide = guide.split("## Recorded evidence and scoped analytics")[0]
    # Capture examples have their own source-named transport check.
    before_capture, after_capture = guide.split("## Capture job leads without AI")
    guide = (
        before_capture
        + "## Preferences and time zone settings"
        + after_capture.split("## Preferences and time zone settings")[1]
    )
    json_examples = [
        json.loads(block) for block in re.findall(r"```json\n(.*?)```", guide, re.S)
    ]
    config = next(block for block in json_examples if "default_profile" in block)
    preferences = next(block for block in json_examples if "time_zone_mode" in block)
    write_cli_config(CliConfig.model_validate(config))
    (tmp_path / "preferences.json").write_text(json.dumps(preferences))
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        state_module,
        "save_auth",
        lambda auth, profile, **kwargs: save_auth(
            auth, profile, prefer_keyring=False, **kwargs
        ),
    )
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        if request.url.path == "/api/auth/whoami":
            return httpx.Response(
                200,
                json={
                    "id": "user-1",
                    "email": "test@example.com",
                    "is_active": True,
                    "is_admin": False,
                    "auth_method": "api_key",
                    "api_key": {
                        "id": "key-1",
                        "label": "docs fake",
                        "preset": "cli",
                        "scopes": list(CLI_REQUIRED_SCOPES),
                        "key_prefix": "fake-key",
                        "created_at": "2026-04-11T10:00:00",
                        "last_used_at": None,
                        "revoked_at": None,
                    },
                },
            )
        assert request.url.path == "/api/user-preferences"
        if request.method == "PATCH":
            assert json.loads(request.content) == preferences
        return httpx.Response(200, json=preferences)

    mock_server(handler)
    examples = [
        line
        for block in re.findall(r"```bash\n(.*?)```", guide, re.S)
        for line in block.splitlines()
        if line.startswith("tarnished ")
    ]
    assert len(examples) == 6
    for example in examples:
        result = runner.invoke(app, shlex.split(example)[1:])
        assert result.exit_code == 0, (example, result.output)
        assert result.stderr == ""
        json.loads(result.stdout)
    assert seen == [("GET", "/api/auth/whoami")] * 3 + [
        ("PATCH", "/api/user-preferences"),
        ("GET", "/api/user-preferences"),
    ]
