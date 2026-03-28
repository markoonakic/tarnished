import typer

from app.cli.client import CLIError
from app.cli.output import emit_result, exit_for_error
from app.cli.state import get_state

app = typer.Typer(help="Read dashboard data.")


@app.command("kpis")
def get_dashboard_kpis(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/dashboard/kpis")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("needs-attention")
def get_needs_attention(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/dashboard/needs-attention")
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
