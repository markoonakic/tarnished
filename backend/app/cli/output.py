from __future__ import annotations

import json
from typing import Any

import typer
from fastapi.encoders import jsonable_encoder

from app.cli.client import APIError, CLIError


def emit_json(data: Any) -> None:
    typer.echo(json.dumps(jsonable_encoder(data), indent=2, sort_keys=True))


def emit_result(state: Any, data: Any, *, text: str | None = None) -> None:
    if getattr(state, "json_output", False):
        emit_json(data)
        return

    if text is not None:
        typer.echo(text)
        return

    emit_json(data)


def emit_error(state: Any, exc: CLIError) -> None:
    if getattr(state, "json_output", False):
        payload: dict[str, Any] = {"error": str(exc)}
        if isinstance(exc, APIError):
            payload["status_code"] = exc.status_code
            if exc.payload is not None:
                payload["details"] = exc.payload
        emit_json(payload)
        return

    typer.echo(str(exc), err=True)


def exit_for_error(state: Any, exc: CLIError) -> None:
    emit_error(state, exc)
    raise typer.Exit(code=1)
