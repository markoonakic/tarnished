import typer

from tarnished_cli.auth_diagnostics import (
    build_auth_diagnostics,
    build_auth_doctor_report,
    parse_live_identity,
)
from tarnished_cli.client import CLIError, TarnishedClient
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import get_state

AUTH_HELP = """Authenticate with API keys managed in the Tarnished web app.

The web app is the authority for creating and rotating API keys. Use the CLI to
validate, store, inspect, and diagnose a locally configured key.

Examples:
  tarnished auth status
  tarnished auth init --api-key '...'
  tarnished auth whoami
  tarnished auth doctor
  tarnished auth api-key set --value '...'
  tarnished auth api-key clear
"""


app = typer.Typer(help=AUTH_HELP)
api_key_app = typer.Typer(help="Manage locally stored API key state.")
app.add_typer(api_key_app, name="api-key")


def _fetch_live_identity(state, *, api_key: str | None = None):
    client = TarnishedClient(
        base_url=state.base_url,
        api_key=api_key if api_key is not None else state.tokens.api_key,
    )
    try:
        payload = client.get_json("/api/auth/whoami", auth="api_key")
    finally:
        client.close()
    return parse_live_identity(payload)


@app.command("status")
def status(ctx: typer.Context) -> None:
    state = get_state(ctx)
    emit_result(
        state,
        {
            "authenticated": bool(state.tokens.api_key),
            "has_api_key": bool(state.tokens.api_key),
            "base_url": state.base_url,
            "profile": state.profile,
        },
    )


@app.command("whoami")
def whoami(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        emit_result(state, _fetch_live_identity(state))
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("doctor")
def doctor(ctx: typer.Context) -> None:
    state = get_state(ctx)
    live_identity = None
    live_identity_error = None

    if state.tokens.api_key:
        try:
            live_identity = _fetch_live_identity(state)
        except CLIError as exc:
            live_identity_error = str(exc)

    report = build_auth_doctor_report(
        profile=state.profile,
        base_url=state.base_url,
        stored_auth=state.tokens,
        live_identity=live_identity,
        live_identity_error=live_identity_error,
    )
    emit_result(state, report)
    if not report["healthy"]:
        raise typer.Exit(code=1)


@app.command("init")
def init_auth(
    ctx: typer.Context,
    api_key: str = typer.Option(
        ...,
        "--api-key",
        prompt=True,
        hide_input=True,
        help="API key to validate and store locally.",
    ),
) -> None:
    state = get_state(ctx)
    try:
        live_identity = _fetch_live_identity(state, api_key=api_key)
        state.save_api_key(api_key)
        emit_result(
            state,
            build_auth_diagnostics(
                profile=state.profile,
                base_url=state.base_url,
                stored_auth=state.tokens,
                live_identity=live_identity,
            ),
            text="Validated and stored API key",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@api_key_app.command("set")
def set_api_key(
    ctx: typer.Context,
    value: str = typer.Option(..., "--value", help="API key value to store locally."),
) -> None:
    state = get_state(ctx)
    state.save_api_key(value)
    emit_result(
        state,
        {"authenticated": True, "has_api_key": True, "profile": state.profile},
        text="Stored API key",
    )


@api_key_app.command("clear")
def clear_api_key(ctx: typer.Context) -> None:
    state = get_state(ctx)
    state.save_api_key(None)
    emit_result(
        state,
        {"authenticated": False, "has_api_key": False, "profile": state.profile},
        text="Cleared stored API key",
    )
