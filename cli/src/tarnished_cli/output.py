from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, cast

import typer
from pydantic import BaseModel

from tarnished_cli.client import APIError, CLIError


def _json_default(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if is_dataclass(value):
        return asdict(cast(Any, value))
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def emit_json(data: Any) -> None:
    typer.echo(json.dumps(data, indent=2, sort_keys=True, default=_json_default))


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
