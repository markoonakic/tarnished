from pathlib import Path

import typer

from app.cli.client import CLIError
from app.cli.input import load_model_body, require_yes
from app.cli.output import emit_result, exit_for_error
from app.cli.state import get_state
from app.schemas.admin import (
    AdminRoundTypeUpdate,
    AdminStatusUpdate,
    AdminUserCreate,
    AdminUserUpdate,
)
from app.schemas.ai_settings import AISettingsUpdate

app = typer.Typer(help="Admin-only commands.")
users_app = typer.Typer(help="Manage users.")
applications_app = typer.Typer(help="Inspect all applications.")
statuses_app = typer.Typer(help="Manage default statuses.")
round_types_app = typer.Typer(help="Manage default round types.")
ai_settings_app = typer.Typer(help="Manage AI settings.")
app.add_typer(users_app, name="users")
app.add_typer(applications_app, name="applications")
app.add_typer(statuses_app, name="statuses")
app.add_typer(round_types_app, name="round-types")
app.add_typer(ai_settings_app, name="ai-settings")


@app.command("stats")
def get_stats(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/admin/stats")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@users_app.command("list")
def list_users(
    ctx: typer.Context,
    page: int = typer.Option(1),
    per_page: int = typer.Option(25),
    query: str | None = typer.Option(None),
) -> None:
    state = get_state(ctx)
    params = {"page": page, "per_page": per_page, "query": query}
    params = {key: value for key, value in params.items() if value is not None}
    try:
        payload = state.build_client().get_json("/api/admin/users", params=params)
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@users_app.command("create")
def create_user(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, AdminUserCreate)
    try:
        payload = state.build_client().post_json("/api/admin/users", body=body)
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@users_app.command("update")
def update_user(
    ctx: typer.Context,
    user_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, AdminUserUpdate)
    try:
        payload = state.build_client().patch_json(
            f"/api/admin/users/{user_id}",
            body=body,
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@users_app.command("delete")
def delete_user(
    ctx: typer.Context,
    user_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"user {user_id}")
    try:
        state.build_client().delete(f"/api/admin/users/{user_id}")
        emit_result(
            state,
            {"deleted": True, "id": user_id},
            text=f"Deleted user {user_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@applications_app.command("list")
def list_admin_applications(
    ctx: typer.Context,
    page: int = typer.Option(1),
    per_page: int = typer.Option(20),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/admin/applications",
            params={"page": page, "per_page": per_page},
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@statuses_app.command("update")
def update_default_status(
    ctx: typer.Context,
    status_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, AdminStatusUpdate)
    try:
        payload = state.build_client().patch_json(
            f"/api/admin/statuses/{status_id}",
            body=body,
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@round_types_app.command("update")
def update_default_round_type(
    ctx: typer.Context,
    round_type_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, AdminRoundTypeUpdate)
    try:
        payload = state.build_client().patch_json(
            f"/api/admin/round-types/{round_type_id}",
            body=body,
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@ai_settings_app.command("get")
def get_ai_settings(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/admin/ai-settings")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@ai_settings_app.command("update")
def update_ai_settings(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, AISettingsUpdate)
    try:
        payload = state.build_client().put_json("/api/admin/ai-settings", body=body)
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
