from pathlib import Path

import typer

from tarnished_cli.client import CLIError
from tarnished_cli.input import load_model_body, require_yes
from tarnished_cli.models import StatusCreate, StatusUpdate
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import get_state

app = typer.Typer(help="Manage application statuses.")


@app.command("list")
def list_statuses(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/statuses", auth="api_key")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("create")
def create_status(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, StatusCreate)
    try:
        payload = state.build_client().post_json(
            "/api/statuses", body=body, auth="api_key"
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("update")
def update_status(
    ctx: typer.Context,
    status_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, StatusUpdate)
    try:
        payload = state.build_client().patch_json(
            f"/api/statuses/{status_id}",
            body=body,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("delete")
def delete_status(
    ctx: typer.Context,
    status_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"status {status_id}")
    try:
        state.build_client().delete(f"/api/statuses/{status_id}", auth="api_key")
        emit_result(
            state,
            {"deleted": True, "id": status_id},
            text=f"Deleted status {status_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)
