import time
from pathlib import Path

import typer

from app.cli.client import CLIError
from app.cli.output import emit_result, exit_for_error
from app.cli.state import get_state

app = typer.Typer(help="Validate and import Tarnished exports.")


@app.command("validate")
def validate_import(
    ctx: typer.Context,
    file_path: Path = typer.Option(..., "--file", exists=True, dir_okay=False),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_file_json(
            "/api/import/validate",
            file_path=file_path,
            auth="jwt",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("run")
def run_import(
    ctx: typer.Context,
    file_path: Path = typer.Option(..., "--file", exists=True, dir_okay=False),
    override: bool = typer.Option(False, "--override"),
    wait: bool = typer.Option(False, "--wait"),
    poll_interval: float = typer.Option(1.0, "--poll-interval"),
    timeout_seconds: float = typer.Option(300.0, "--timeout-seconds"),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_file_json(
            "/api/import/import",
            file_path=file_path,
            data={"override": "true" if override else "false"},
            auth="jwt",
        )
        if not wait:
            emit_result(state, payload)
            return

        import_id = payload["import_id"]
        deadline = time.monotonic() + timeout_seconds
        while True:
            status = state.build_client().get_json(
                f"/api/import/status/{import_id}",
                auth="jwt",
            )
            if status.get("status") == "complete":
                emit_result(state, status)
                return
            if time.monotonic() >= deadline:
                raise CLIError(f"Timed out waiting for import {import_id}.")
            time.sleep(poll_interval)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("status")
def get_import_status(ctx: typer.Context, import_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/import/status/{import_id}",
            auth="jwt",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
