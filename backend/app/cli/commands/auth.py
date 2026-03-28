import typer

from app.cli.client import CLIError
from app.cli.output import emit_error, emit_result
from app.cli.state import get_state

app = typer.Typer(help="Authenticate and inspect session state.")
api_key_app = typer.Typer(help="Manage stored API key state.")
app.add_typer(api_key_app, name="api-key")


@app.command("login")
def login(
    ctx: typer.Context,
    email: str = typer.Option(..., help="Account email."),
    password: str = typer.Option(..., hide_input=True, help="Account password."),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client(auth_required=False).post_json(
            "/api/auth/login",
            body={"email": email, "password": password},
            auth="none",
        )
        state.save_tokens(payload["access_token"], payload["refresh_token"])
        emit_result(
            state,
            {"authenticated": True, "email": email, "profile": state.profile},
            text=f"Logged in as {email}",
        )
    except CLIError as exc:
        emit_error(state, exc)
        raise typer.Exit(code=1) from exc


@app.command("whoami")
def whoami(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/auth/me")
        emit_result(state, payload)
    except CLIError as exc:
        emit_error(state, exc)
        raise typer.Exit(code=1) from exc


@app.command("status")
def status(ctx: typer.Context) -> None:
    state = get_state(ctx)
    emit_result(
        state,
        {
            "authenticated": bool(state.tokens.access_token),
            "has_api_key": bool(state.tokens.api_key),
            "base_url": state.base_url,
            "profile": state.profile,
        },
    )


@app.command("logout")
def logout(ctx: typer.Context) -> None:
    state = get_state(ctx)
    state.clear_tokens()
    emit_result(
        state,
        {
            "authenticated": False,
            "has_api_key": bool(state.tokens.api_key),
            "profile": state.profile,
        },
        text="Logged out",
    )


def _sanitize_api_key_payload(payload: dict) -> dict:
    return {
        "has_api_key": payload.get("has_api_key", False),
        "api_key_masked": payload.get("api_key_masked"),
        "stored_locally": bool(payload.get("api_key_full")),
    }


@api_key_app.command("show")
def show_api_key(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/settings/api-key")
        if payload.get("api_key_full"):
            state.save_api_key(payload["api_key_full"])
        emit_result(state, _sanitize_api_key_payload(payload))
    except CLIError as exc:
        emit_error(state, exc)
        raise typer.Exit(code=1) from exc


@api_key_app.command("regenerate")
def regenerate_api_key(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_json(
            "/api/settings/api-key/regenerate",
            body={},
        )
        if payload.get("api_key_full"):
            state.save_api_key(payload["api_key_full"])
        emit_result(state, _sanitize_api_key_payload(payload))
    except CLIError as exc:
        emit_error(state, exc)
        raise typer.Exit(code=1) from exc


@api_key_app.command("clear")
def clear_api_key(ctx: typer.Context) -> None:
    state = get_state(ctx)
    state.save_api_key(None)
    emit_result(
        state,
        {"has_api_key": False, "stored_locally": False},
        text="Cleared stored API key",
    )
