import json

import pytest

import tarnished_cli.state as state_module
from tarnished_cli.auth_storage import StoredAuth, load_auth, save_auth
from tarnished_cli.config import CliConfig, ProfileConfig, load_config
from tarnished_cli.main import app
from tarnished_cli.state import AppState


def test_load_config_prefers_env_base_url(monkeypatch, cli_config_dir):
    monkeypatch.setenv("TARNISHED_BASE_URL", "https://example.test")
    monkeypatch.setattr(state_module, "load_auth", lambda *args, **kwargs: StoredAuth())
    state = AppState.load(
        profile=None, base_url=None, json_output=False, config_dir=cli_config_dir
    )
    assert state.base_url == "https://example.test"
    assert (
        load_config(cli_config_dir).profiles["default"].base_url
        == "http://127.0.0.1:5577"
    )


@pytest.mark.parametrize("selected", [None, "default", "work"])
@pytest.mark.parametrize("env_url", [None, "https://env.test/"])
@pytest.mark.parametrize("flag_url", [None, "https://flag.test/"])
def test_selected_profile_precedence_without_persistence(
    selected, env_url, flag_url, runner, cli_config_dir, monkeypatch, write_cli_config
):
    config = CliConfig(
        default_profile="work",
        profiles={
            "default": ProfileConfig(base_url="https://default.test", output="text"),
            "work": ProfileConfig(base_url="https://work.test", output="json"),
        },
    )
    path = write_cli_config(config)
    before = path.read_bytes()
    requested = []

    def stored(profile, *, config_dir):
        requested.append(profile)
        return StoredAuth(api_key="fake-" + profile)

    monkeypatch.setattr(state_module, "load_auth", stored)
    if env_url:
        monkeypatch.setenv("TARNISHED_BASE_URL", env_url)
    else:
        monkeypatch.delenv("TARNISHED_BASE_URL", raising=False)
    args = ["--json"]
    if selected:
        args += ["--profile", selected]
    if flag_url:
        args += ["--base-url", flag_url]
    result = runner.invoke(app, [*args, "auth", "status"])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    profile = selected or "work"
    assert payload["profile"] == profile
    assert requested == [profile]
    assert payload["base_url"] == (
        flag_url or env_url or f"https://{profile}.test"
    ).rstrip("/")
    assert path.read_bytes() == before
    assert load_config(cli_config_dir) == config


def test_new_profile_auth_init_does_not_modify_other_profiles(
    runner, cli_config_dir, monkeypatch, write_cli_config
):
    import httpx

    import tarnished_cli.commands.auth as auth_commands
    from tarnished_cli.client import TarnishedClient

    path = write_cli_config(CliConfig())
    before = path.read_bytes()
    save_auth(
        StoredAuth(api_key="old-key"), config_dir=cli_config_dir, prefer_keyring=False
    )
    monkeypatch.setattr(
        state_module,
        "load_auth",
        lambda profile, **kwargs: load_auth(profile, prefer_keyring=False, **kwargs),
    )
    monkeypatch.setattr(
        state_module,
        "save_auth",
        lambda auth, profile, **kwargs: save_auth(
            auth, profile, prefer_keyring=False, **kwargs
        ),
    )

    def handler(request):
        assert request.headers["X-API-Key"] == "new-fake-key"
        assert request.url.host == "new.test"
        return httpx.Response(
            200,
            json={
                "id": "user-1",
                "email": "test@example.com",
                "is_admin": False,
                "is_active": True,
                "auth_method": "api_key",
                "api_key": {
                    "id": "key-1",
                    "label": "test",
                    "preset": "custom",
                    "scopes": ["profile:read"],
                    "key_prefix": "new-fake",
                    "created_at": "2026-04-11T10:00:00",
                    "last_used_at": None,
                    "revoked_at": None,
                },
            },
        )

    monkeypatch.setattr(
        auth_commands,
        "TarnishedClient",
        lambda **kwargs: TarnishedClient(
            **kwargs, transport=httpx.MockTransport(handler)
        ),
    )
    result = runner.invoke(
        app,
        [
            "--profile",
            "new",
            "--base-url",
            "https://new.test",
            "auth",
            "init",
            "--api-key",
            "new-fake-key",
        ],
    )
    assert result.exit_code == 0, result.output
    assert (
        load_auth("new", config_dir=cli_config_dir, prefer_keyring=False).api_key
        == "new-fake-key"
    )
    assert (
        load_auth(config_dir=cli_config_dir, prefer_keyring=False).api_key == "old-key"
    )
    assert path.read_bytes() == before


@pytest.mark.parametrize(
    "env_output,flag,expected",
    [
        (None, False, False),
        ("json", False, True),
        ("text", False, False),
        ("text", True, True),
        ("invalid", False, False),
    ],
)
def test_output_precedence_applies_to_selected_profile(
    env_output, flag, expected, cli_config_dir, monkeypatch, write_cli_config
):
    config = CliConfig(
        default_profile="work",
        profiles={
            "default": ProfileConfig(output="json"),
            "work": ProfileConfig(output="text"),
        },
    )
    write_cli_config(config)
    monkeypatch.setattr(state_module, "load_auth", lambda *args, **kwargs: StoredAuth())
    if env_output is not None:
        monkeypatch.setenv("TARNISHED_OUTPUT", env_output)
    else:
        monkeypatch.delenv("TARNISHED_OUTPUT", raising=False)
    state = AppState.load(
        profile=None, base_url=None, json_output=flag, config_dir=cli_config_dir
    )
    assert state.json_output is expected
    assert load_config(cli_config_dir) == config
