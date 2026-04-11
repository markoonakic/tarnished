import importlib
import json
import re
from typing import Any, cast

import pytest

import tarnished_cli.commands.auth as auth_commands
import tarnished_cli.state as state_module
from tarnished_cli.auth_storage import load_auth as load_auth_impl
from tarnished_cli.auth_storage import save_auth as save_auth_impl
from tarnished_cli.client import CLIError
from tarnished_cli.main import app


def _load_auth_file_only(profile="default", *, config_dir=None):
    return load_auth_impl(profile, config_dir=config_dir, prefer_keyring=False)


def _save_auth_file_only(auth, profile="default", *, config_dir=None):
    return save_auth_impl(auth, profile, config_dir=config_dir, prefer_keyring=False)


def test_status_reports_logged_out(runner):
    result = runner.invoke(app, ["auth", "status"])

    assert result.exit_code == 0
    assert '"authenticated": false' in result.stdout.lower()


def test_status_reports_authenticated_when_api_key_exists(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    save_auth_impl(
        state_module.StoredAuth(api_key="api-key-123"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )

    result = runner.invoke(app, ["auth", "status"])

    assert result.exit_code == 0
    assert '"authenticated": true' in result.stdout.lower()
    assert '"has_api_key": true' in result.stdout.lower()


def test_api_key_set_persists_key(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)

    result = runner.invoke(
        app,
        ["auth", "api-key", "set", "--value", "api-key-123"],
    )

    assert result.exit_code == 0
    stored = load_auth_impl(config_dir=cli_config_dir, prefer_keyring=False)
    assert stored.api_key == "api-key-123"


def test_api_key_clear_removes_stored_key(runner, cli_config_dir, monkeypatch):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    save_auth_impl(
        state_module.StoredAuth(api_key="api-key-123"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )

    result = runner.invoke(app, ["auth", "api-key", "clear"])

    assert result.exit_code == 0
    stored = load_auth_impl(config_dir=cli_config_dir, prefer_keyring=False)
    assert stored.api_key is None


def _cli_preset_scopes() -> list[str]:
    return [
        "applications:read",
        "applications:write",
        "job_leads:read",
        "job_leads:write",
        "profile:read",
        "profile:write",
        "rounds:read",
        "rounds:write",
        "statuses:read",
        "statuses:write",
        "round_types:read",
        "round_types:write",
        "dashboard:read",
        "analytics:read",
        "streak:read",
        "streak:write",
        "preferences:read",
        "preferences:write",
        "user_settings:read",
        "user_settings:write",
        "files:read",
        "files:write",
        "export:read",
        "import:write",
    ]


def _live_identity_payload(
    *, scopes: list[str] | None = None, preset: str = "custom"
) -> dict[str, object]:
    return {
        "id": "user-1",
        "email": "whoami@example.com",
        "is_admin": False,
        "is_active": True,
        "auth_method": "api_key",
        "api_key": {
            "id": "key-1",
            "label": "MacBook CLI",
            "preset": preset,
            "scopes": scopes or ["applications:read"],
            "key_prefix": "api-key-",
            "created_at": "2026-04-11T10:00:00",
            "last_used_at": "2026-04-11T11:00:00",
            "revoked_at": None,
        },
    }


def test_auth_whoami_uses_live_server_identity_with_stored_api_key(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    save_auth_impl(
        state_module.StoredAuth(api_key="api-key-123"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )

    client_calls: list[tuple[str, str | None]] = []

    class FakeTarnishedClient:
        def __init__(self, *, base_url, api_key=None, transport=None):
            client_calls.append(("init", api_key))

        def get_json(self, path, *, params=None, auth="api_key"):
            client_calls.append((path, auth))
            return _live_identity_payload()

        def close(self):
            return None

    monkeypatch.setattr(
        auth_commands, "TarnishedClient", FakeTarnishedClient, raising=False
    )

    result = runner.invoke(app, ["auth", "whoami"])

    assert result.exit_code == 0
    assert client_calls[0] == ("init", "api-key-123")
    assert client_calls[1] == ("/api/auth/whoami", "api_key")
    assert '"email": "whoami@example.com"' in result.stdout
    assert '"auth_method": "api_key"' in result.stdout


def test_auth_init_validates_key_before_persisting_it(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)

    events: list[tuple[str, str | None]] = []

    def _recording_save_auth(
        auth, profile="default", *, config_dir=None, prefer_keyring=True
    ):
        events.append(("persist", auth.api_key))
        return _save_auth_file_only(auth, profile, config_dir=config_dir)

    class FakeTarnishedClient:
        def __init__(self, *, base_url, api_key=None, transport=None):
            events.append(("init", api_key))
            self.api_key = api_key

        def get_json(self, path, *, params=None, auth="api_key"):
            events.append(("validate", self.api_key))
            assert path == "/api/auth/whoami"
            assert auth == "api_key"
            return _live_identity_payload()

        def close(self):
            return None

    monkeypatch.setattr(state_module, "save_auth", _recording_save_auth)
    monkeypatch.setattr(
        auth_commands, "TarnishedClient", FakeTarnishedClient, raising=False
    )

    result = runner.invoke(app, ["auth", "init", "--api-key", "api-key-123"])

    assert result.exit_code == 0
    assert events.index(("validate", "api-key-123")) < events.index(
        ("persist", "api-key-123")
    )
    stored = load_auth_impl(config_dir=cli_config_dir, prefer_keyring=False)
    assert stored.api_key == "api-key-123"
    assert '"stored_api_key_prefix": "api-key-"' in result.stdout
    assert '"email": "whoami@example.com"' in result.stdout


def test_auth_init_does_not_persist_key_when_validation_fails(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)

    events: list[tuple[str, str | None]] = []

    def _recording_save_auth(
        auth, profile="default", *, config_dir=None, prefer_keyring=True
    ):
        events.append(("persist", auth.api_key))
        return _save_auth_file_only(auth, profile, config_dir=config_dir)

    class FakeTarnishedClient:
        def __init__(self, *, base_url, api_key=None, transport=None):
            self.api_key = api_key

        def get_json(self, path, *, params=None, auth="api_key"):
            events.append(("validate", self.api_key))
            assert path == "/api/auth/whoami"
            assert auth == "api_key"
            raise CLIError("Invalid API key")

        def close(self):
            return None

    monkeypatch.setattr(state_module, "save_auth", _recording_save_auth)
    monkeypatch.setattr(
        auth_commands, "TarnishedClient", FakeTarnishedClient, raising=False
    )

    result = runner.invoke(app, ["auth", "init", "--api-key", "bad-api-key"])

    assert result.exit_code == 1
    assert events == [("validate", "bad-api-key")]
    stored = load_auth_impl(config_dir=cli_config_dir, prefer_keyring=False)
    assert stored.api_key is None
    combined = result.output + result.stderr
    assert "Invalid API key" in combined


def test_auth_doctor_fails_when_no_api_key_is_configured(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)

    client_calls: list[str] = []

    class FakeTarnishedClient:
        def __init__(self, *, base_url, api_key=None, transport=None):
            client_calls.append("init")

        def get_json(self, path, *, params=None, auth="api_key"):
            raise AssertionError(
                "doctor should not call the server without a stored key"
            )

        def close(self):
            return None

    monkeypatch.setattr(
        auth_commands, "TarnishedClient", FakeTarnishedClient, raising=False
    )

    result = runner.invoke(app, ["auth", "doctor"])

    assert result.exit_code == 1
    report = json.loads(result.stdout)
    checks = {check["name"]: check for check in report["checks"]}

    assert report["healthy"] is False
    assert report["has_stored_api_key"] is False
    assert report["live_identity"] is None
    assert checks["stored_api_key"]["status"] == "fail"
    assert "No stored API key configured" in checks["stored_api_key"]["message"]
    assert "tarnished auth init --api-key" in checks["stored_api_key"]["message"]
    assert checks["api_key_authentication"]["status"] == "skip"
    assert checks["cli_scopes"]["status"] == "skip"
    assert client_calls == []


def test_auth_doctor_surfaces_missing_cli_scopes_clearly(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    save_auth_impl(
        state_module.StoredAuth(api_key="api-key-123"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )

    class FakeTarnishedClient:
        def __init__(self, *, base_url, api_key=None, transport=None):
            self.api_key = api_key

        def get_json(self, path, *, params=None, auth="api_key"):
            assert path == "/api/auth/whoami"
            assert auth == "api_key"
            assert self.api_key == "api-key-123"
            return _live_identity_payload(scopes=["applications:read"], preset="custom")

        def close(self):
            return None

    monkeypatch.setattr(
        auth_commands, "TarnishedClient", FakeTarnishedClient, raising=False
    )

    result = runner.invoke(app, ["auth", "doctor"])

    assert result.exit_code == 1
    report = json.loads(result.stdout)
    checks = {check["name"]: check for check in report["checks"]}

    assert report["healthy"] is False
    assert checks["stored_api_key"]["status"] == "pass"
    assert checks["api_key_authentication"]["status"] == "pass"
    assert checks["cli_scopes"]["status"] == "fail"
    assert "missing required CLI scopes" in checks["cli_scopes"]["message"]
    assert "job_leads:read" in checks["cli_scopes"]["message"]
    assert report["live_identity"]["api_key"]["scopes"] == ["applications:read"]


def test_auth_doctor_reports_passing_checks_for_cli_preset_key(
    runner, cli_config_dir, monkeypatch
):
    monkeypatch.setattr(state_module, "load_auth", _load_auth_file_only)
    monkeypatch.setattr(state_module, "save_auth", _save_auth_file_only)
    save_auth_impl(
        state_module.StoredAuth(api_key="api-key-123"),
        config_dir=cli_config_dir,
        prefer_keyring=False,
    )

    class FakeTarnishedClient:
        def __init__(self, *, base_url, api_key=None, transport=None):
            self.api_key = api_key

        def get_json(self, path, *, params=None, auth="api_key"):
            assert path == "/api/auth/whoami"
            assert auth == "api_key"
            assert self.api_key == "api-key-123"
            return _live_identity_payload(scopes=_cli_preset_scopes(), preset="cli")

        def close(self):
            return None

    monkeypatch.setattr(
        auth_commands, "TarnishedClient", FakeTarnishedClient, raising=False
    )

    result = runner.invoke(app, ["auth", "doctor"])

    assert result.exit_code == 0
    report = json.loads(result.stdout)
    checks = {check["name"]: check for check in report["checks"]}

    assert report["healthy"] is True
    assert all(check["status"] == "pass" for check in checks.values())
    assert report["stored_api_key_prefix"] == "api-key-"
    assert report["live_identity"]["email"] == "whoami@example.com"
    assert report["live_identity"]["api_key"]["preset"] == "cli"


def _normalize_help(text: str) -> str:
    text = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def test_root_help_highlights_api_key_first_auth_flow(runner):
    result = runner.invoke(app, ["--help"])

    assert result.exit_code == 0
    output = _normalize_help(result.stdout)
    assert "auth init --api-key" in output
    assert "auth doctor" in output
    assert "api-key auth" in output


def test_auth_help_mentions_web_managed_api_keys_and_doctor(runner):
    result = runner.invoke(app, ["auth", "--help"])

    assert result.exit_code == 0
    output = _normalize_help(result.stdout)
    assert "web app" in output
    assert "auth doctor" in output
    assert "api-key" in output


def _import_or_fail(module_name: str):
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        pytest.fail(f"Expected module {module_name} to exist for Task 11: {exc}")


def test_parse_live_identity_returns_exported_model_for_api_key_payload():
    diagnostics_module = _import_or_fail("tarnished_cli.auth_diagnostics")
    models_module = _import_or_fail("tarnished_cli.models")

    parse_live_identity = getattr(diagnostics_module, "parse_live_identity", None)
    live_auth_identity_model = getattr(models_module, "LiveAuthIdentity", None)

    assert callable(parse_live_identity)
    assert live_auth_identity_model is not None

    identity = cast(
        Any,
        parse_live_identity(
            {
                "id": "user-1",
                "email": "whoami@example.com",
                "is_admin": False,
                "is_active": True,
                "auth_method": "api_key",
                "api_key": {
                    "id": "key-1",
                    "label": "MacBook CLI",
                    "preset": "custom",
                    "scopes": ["applications:read"],
                    "key_prefix": "api-key-",
                    "created_at": "2026-04-11T10:00:00",
                    "last_used_at": "2026-04-11T11:00:00",
                    "revoked_at": None,
                },
            }
        ),
    )

    assert isinstance(identity, live_auth_identity_model)
    assert identity.email == "whoami@example.com"
    assert identity.auth_method == "api_key"
    assert identity.api_key is not None
    assert identity.api_key.label == "MacBook CLI"
    assert identity.api_key.key_prefix == "api-key-"
    assert identity.api_key.scopes == ["applications:read"]
    assert identity.api_key.created_at.isoformat() == "2026-04-11T10:00:00"


def test_build_auth_diagnostics_captures_stored_prefix_for_auth_init_groundwork():
    diagnostics_module = _import_or_fail("tarnished_cli.auth_diagnostics")
    models_module = _import_or_fail("tarnished_cli.models")

    build_auth_diagnostics = getattr(diagnostics_module, "build_auth_diagnostics", None)
    auth_diagnostics_model = getattr(models_module, "AuthDiagnostics", None)

    assert callable(build_auth_diagnostics)
    assert auth_diagnostics_model is not None

    diagnostics = cast(
        Any,
        build_auth_diagnostics(
            profile="default",
            base_url="https://api.example.com",
            stored_auth=state_module.StoredAuth(api_key="api-key-1234567890"),
            live_identity={
                "id": "user-1",
                "email": "whoami@example.com",
                "is_admin": False,
                "is_active": True,
                "auth_method": "api_key",
                "api_key": {
                    "id": "key-1",
                    "label": "MacBook CLI",
                    "preset": "custom",
                    "scopes": ["applications:read"],
                    "key_prefix": "api-key-",
                    "created_at": "2026-04-11T10:00:00",
                    "last_used_at": "2026-04-11T11:00:00",
                    "revoked_at": None,
                },
            },
        ),
    )

    assert isinstance(diagnostics, auth_diagnostics_model)
    assert diagnostics.profile == "default"
    assert diagnostics.base_url == "https://api.example.com"
    assert diagnostics.has_stored_api_key is True
    assert diagnostics.stored_api_key_prefix == "api-key-"
    assert diagnostics.live_identity is not None
    assert diagnostics.live_identity.api_key is not None
    assert diagnostics.live_identity.api_key.key_prefix == "api-key-"


def test_build_auth_diagnostics_omits_prefix_when_no_local_api_key():
    diagnostics_module = _import_or_fail("tarnished_cli.auth_diagnostics")
    build_auth_diagnostics = getattr(diagnostics_module, "build_auth_diagnostics", None)

    assert callable(build_auth_diagnostics)

    diagnostics = cast(
        Any,
        build_auth_diagnostics(
            profile="default",
            base_url="https://api.example.com",
            stored_auth=state_module.StoredAuth(),
        ),
    )

    assert diagnostics.has_stored_api_key is False
    assert diagnostics.stored_api_key_prefix is None
    assert diagnostics.live_identity is None
