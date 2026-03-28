from pathlib import Path

import typer

from app.cli.client import CLIError
from app.cli.input import load_model_body
from app.cli.output import emit_result, exit_for_error
from app.cli.state import get_state
from app.schemas.settings import UserSettingsUpdate

app = typer.Typer(help="Manage theme and accent settings.")


@app.command("get")
def get_user_settings(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/users/settings",
            auth="flexible",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("update")
def update_user_settings(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, UserSettingsUpdate)
    try:
        payload = state.build_client().patch_json(
            "/api/users/settings",
            body=body,
            auth="flexible",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
