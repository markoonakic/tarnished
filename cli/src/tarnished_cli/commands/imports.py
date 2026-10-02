import time
from pathlib import Path

import typer

from tarnished_cli.client import CLIError, redact_credentials
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.polling import validate_wait_options
from tarnished_cli.state import get_state

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
            auth="api_key",
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
    client = None
    try:
        validate_wait_options(poll_interval, timeout_seconds)

        client = state.build_client()
        payload = client.post_file_json(
            "/api/import/import",
            file_path=file_path,
            data={"override": "true" if override else "false"},
            auth="api_key",
        )
        if not wait:
            emit_result(state, payload)
            return

        if not isinstance(payload, dict) or not isinstance(
            payload.get("import_id"), str
        ):
            raise CLIError("Unexpected import start response: missing import_id.")
        import_id = payload["import_id"]
        deadline = time.monotonic() + timeout_seconds
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CLIError(f"Timed out waiting for import {import_id}.")
            status = client.get_json(
                f"/api/import/status/{import_id}",
                auth="api_key",
                timeout=min(30.0, remaining),
            )
            if not isinstance(status, dict) or status.get("status") not in (
                "queued",
                "pending",
                "processing",
                "complete",
                "failed",
                "cancelled",
            ):
                raise CLIError("Unexpected import status response.")
            outcome = status["status"]
            if outcome == "complete":
                emit_result(state, status)
                return
            if outcome in {"failed", "cancelled"}:
                detail = (
                    status.get("message")
                    or status.get("error")
                    or "No details returned."
                )
                raise CLIError(
                    redact_credentials(
                        f"Import {import_id} {outcome}: {detail}", state.tokens.api_key
                    )
                )
            remaining = deadline - time.monotonic()
            if remaining > 0:
                time.sleep(min(poll_interval, remaining))
    except CLIError as exc:
        exit_for_error(state, exc)
    finally:
        if client is not None:
            client.close()


@app.command("status")
def get_import_status(ctx: typer.Context, import_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/import/status/{import_id}",
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
