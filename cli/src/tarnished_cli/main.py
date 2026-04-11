from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from textwrap import dedent

import typer

from tarnished_cli.commands import (
    admin,
    analytics,
    applications,
    auth,
    dashboard,
    exports,
    imports,
    job_leads,
    preferences,
    profile,
    round_types,
    rounds,
    statuses,
    user_settings,
)
from tarnished_cli.state import AppState


def _cli_version() -> str:
    try:
        return version("tarnished-cli")
    except PackageNotFoundError:
        return "0.0.0"


ROOT_HELP = dedent(
    """\
    API-key auth CLI for Tarnished.

    Create or rotate API keys in the Tarnished web app, then validate and store
    them locally with the auth commands.

    Examples:
      tarnished auth status --json
      tarnished auth init --api-key '...'
      tarnished auth doctor
      tarnished applications list --json
      tarnished <command> --help
    """
)


app = typer.Typer(no_args_is_help=True, help=ROOT_HELP)
app.add_typer(auth.app, name="auth")
app.add_typer(admin.app, name="admin")
app.add_typer(applications.app, name="applications")
app.add_typer(job_leads.app, name="job-leads")
app.add_typer(profile.app, name="profile")
app.add_typer(statuses.app, name="statuses")
app.add_typer(round_types.app, name="round-types")
app.add_typer(rounds.app, name="rounds")
app.add_typer(user_settings.app, name="user-settings")
app.add_typer(preferences.app, name="preferences")
app.add_typer(exports.app, name="export")
app.add_typer(imports.app, name="import")
app.add_typer(dashboard.app, name="dashboard")
app.add_typer(analytics.app, name="analytics")


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    profile: str = typer.Option("default", "--profile", help="Named CLI profile."),
    base_url: str | None = typer.Option(
        None, "--base-url", help="Override the profile base URL for this command."
    ),
    config_dir: Path | None = typer.Option(
        None, "--config-dir", help="Override the CLI config directory."
    ),
    json_output: bool = typer.Option(
        False, "--json", help="Emit machine-readable JSON output."
    ),
    verbose: bool = typer.Option(False, "--verbose", help="Enable verbose output."),
    show_version: bool = typer.Option(
        False, "--version", help="Show CLI version and exit."
    ),
) -> None:
    if show_version:
        typer.echo(_cli_version())
        raise typer.Exit(code=0)

    ctx.obj = AppState.load(
        profile=profile,
        base_url=base_url,
        json_output=json_output,
        verbose=verbose,
        config_dir=config_dir,
    )
