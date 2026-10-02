import typer

from tarnished_cli.client import CLIError
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import get_state

app = typer.Typer(help="Read dashboard data.")


@app.command("kpis")
def get_dashboard_kpis(
    ctx: typer.Context,
    period: str = typer.Option("all"),
    as_of: str | None = typer.Option(None),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/dashboard/kpis",
            params={"period": period, **({"as_of": as_of} if as_of else {})},
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("needs-attention")
def get_needs_attention(
    ctx: typer.Context,
    period: str = typer.Option("all"),
    as_of: str | None = typer.Option(None),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/dashboard/needs-attention",
            params={"period": period, **({"as_of": as_of} if as_of else {})},
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("streak")
def get_streak(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/streak")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
