import typer

from tarnished_cli.output import emit_result
from tarnished_cli.state import get_state

AUTH_HELP = """Authenticate and inspect session state.

Examples:
  tarnished auth status
  tarnished auth api-key set --value '...'
  tarnished auth api-key clear
"""


app = typer.Typer(help=AUTH_HELP)
api_key_app = typer.Typer(help="Manage locally stored API key state.")
app.add_typer(api_key_app, name="api-key")


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
