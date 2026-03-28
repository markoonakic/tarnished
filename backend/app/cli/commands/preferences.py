from pathlib import Path

import typer
from pydantic import BaseModel

from app.cli.client import CLIError
from app.cli.input import load_model_body
from app.cli.output import emit_result, exit_for_error
from app.cli.state import get_state


class PreferencesUpdate(BaseModel):
    show_streak_stats: bool | None = None
    show_needs_attention: bool | None = None
    show_heatmap: bool | None = None


app = typer.Typer(help="Manage dashboard user preferences.")


@app.command("get")
def get_preferences(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/user-preferences")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("update")
def update_preferences(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, PreferencesUpdate)
    try:
        payload = state.build_client().put_json(
            "/api/user-preferences",
            body=body,
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
