from pathlib import Path

import typer

from tarnished_cli.client import CLIError
from tarnished_cli.input import load_model_body, require_yes
from tarnished_cli.models import RoundTypeCreate
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import get_state

app = typer.Typer(help="Manage round types.")


@app.command("list")
def list_round_types(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/round-types", auth="jwt")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("create")
def create_round_type(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, RoundTypeCreate)
    try:
        payload = state.build_client().post_json(
            "/api/round-types",
            body=body,
            auth="jwt",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("update")
def update_round_type(
    ctx: typer.Context,
    round_type_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, RoundTypeCreate)
    try:
        payload = state.build_client().patch_json(
            f"/api/round-types/{round_type_id}",
            body=body,
            auth="jwt",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("delete")
def delete_round_type(
    ctx: typer.Context,
    round_type_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"round type {round_type_id}")
    try:
        state.build_client().delete(f"/api/round-types/{round_type_id}", auth="jwt")
        emit_result(
            state,
            {"deleted": True, "id": round_type_id},
            text=f"Deleted round type {round_type_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)
