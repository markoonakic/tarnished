import json
from pathlib import Path

import httpx
import pytest
from typer.testing import CliRunner

import tarnished_cli.commands.auth as auth_commands
import tarnished_cli.state as state_module
from tarnished_cli.client import TarnishedClient
from tarnished_cli.config import CliConfig


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


@pytest.fixture
def cli_config_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("TARNISHED_CONFIG_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def write_cli_config(cli_config_dir):
    def write(config: CliConfig) -> Path:
        path = cli_config_dir / "config.json"
        path.write_text(json.dumps(config.model_dump(mode="json")), encoding="utf-8")
        return path

    return write


@pytest.fixture
def mock_server(monkeypatch, cli_config_dir):
    monkeypatch.setenv("TARNISHED_API_KEY", "test-only-api-key")
    monkeypatch.setenv("TARNISHED_BASE_URL", "https://api.example.test")
    clients = []

    def install(handler):
        def build(*, base_url, api_key=None, transport=None):
            client = TarnishedClient(
                base_url=base_url,
                api_key=api_key,
                transport=httpx.MockTransport(handler),
            )
            clients.append(client)
            return client

        monkeypatch.setattr(state_module, "TarnishedClient", build)
        monkeypatch.setattr(auth_commands, "TarnishedClient", build)

    yield install
    for client in clients:
        client.close()
