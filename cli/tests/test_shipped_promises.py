"""CLI scope presets and wait options."""

import runpy
from pathlib import Path

import pytest
import typer

from tarnished_cli.auth_diagnostics import CLI_REQUIRED_SCOPES
from tarnished_cli.commands import reports as reports_commands
from tarnished_cli.commands import transcriptions as transcriptions_commands

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_SCOPES = REPO_ROOT / "backend" / "app" / "core" / "api_key_scopes.py"


def _backend_cli_preset_scopes() -> set[str]:
    return set(runpy.run_path(str(BACKEND_SCOPES))["CLI_SCOPES"])


def test_cli_required_scopes_match_the_backend_cli_preset():
    """A CLI-preset key must not look healthy while a CLI command would 403."""
    assert set(CLI_REQUIRED_SCOPES) == _backend_cli_preset_scopes()


def _accepted_options(typer_app: typer.Typer, *command_path: str) -> set[str]:
    """Resolve the Click command for a Typer path and list its real options."""
    group: typer.Typer = typer_app
    for name in command_path[:-1]:
        sub = next(info for info in group.registered_groups if info.name == name)
        nested = sub.typer_instance
        assert nested is not None
        group = nested
    command_name = command_path[-1]
    click_command = typer.main.get_command(group)
    return {
        param
        for command in getattr(click_command, "commands", {}).values()
        if command.name == command_name
        for param in command.params
        for param in (param.opts + param.secondary_opts)
    }


@pytest.mark.parametrize(
    "help_typer, path, promised",
    [
        (
            reports_commands.app,
            ("pipeline", "request"),
            {"--wait", "--poll-interval", "--timeout-seconds"},
        ),
        (
            reports_commands.app,
            ("interview", "request"),
            {"--wait", "--poll-interval", "--timeout-seconds"},
        ),
        (
            reports_commands.app,
            ("application", "request"),
            {"--wait", "--poll-interval", "--timeout-seconds"},
        ),
        (
            transcriptions_commands.app,
            ("start",),
            {
                "--speech-configuration-revision",
                "--wait",
                "--poll-interval",
                "--timeout-seconds",
            },
        ),
        (
            transcriptions_commands.app,
            ("retry",),
            {"--wait", "--poll-interval", "--timeout-seconds"},
        ),
    ],
)
def test_options_promised_in_help_are_accepted(help_typer, path, promised):
    """Report and transcription commands accept the documented wait options."""
    assert promised, "a case with no promised options asserts nothing"
    accepted = _accepted_options(help_typer, *path)
    missing = {option for option in promised if option not in accepted}
    assert not missing, f"help names unsupported options: {sorted(missing)}"
