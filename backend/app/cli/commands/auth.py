import typer

from app.cli.client import CLIError
from app.cli.output import emit_error, emit_result
from app.cli.state import get_state

app = typer.Typer(help="Authenticate and inspect session state.")


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
