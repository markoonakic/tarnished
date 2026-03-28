from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import typer
from pydantic import BaseModel, ValidationError


def load_model_body(body_file: Path, model_type: type[BaseModel]) -> dict[str, Any]:
    try:
        payload = json.loads(body_file.read_text())
    except json.JSONDecodeError as exc:
        raise typer.BadParameter(f"Invalid JSON body: {exc}") from exc

    if not isinstance(payload, dict):
        raise typer.BadParameter("JSON body must be an object.")

    try:
        model = model_type.model_validate(payload)
    except ValidationError as exc:
        raise typer.BadParameter(str(exc)) from exc

    return model.model_dump(mode="json", exclude_unset=True)


def require_yes(yes: bool, *, resource: str) -> None:
    if yes:
        return
    raise typer.BadParameter(
        f"Deleting {resource} requires --yes.",
        param_hint="--yes",
    )
