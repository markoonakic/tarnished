from pathlib import Path

import typer

from tarnished_cli.client import CLIError
from tarnished_cli.input import load_model_body
from tarnished_cli.models import InsightsRequest
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import get_state

app = typer.Typer(help="Read analytics data.")


@app.command("kpis")
def get_analytics_kpis(
    ctx: typer.Context,
    period: str = typer.Option("30d"),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/analytics/kpis",
            params={"period": period},
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("heatmap")
def get_heatmap(
    ctx: typer.Context,
    year: int | None = typer.Option(None),
    rolling: bool = typer.Option(False),
) -> None:
    state = get_state(ctx)
    params: dict[str, bool | int] = {"rolling": rolling}
    if year is not None:
        params["year"] = year
    try:
        payload = state.build_client().get_json("/api/analytics/heatmap", params=params)
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("weekly")
def get_weekly(
    ctx: typer.Context,
    period: str = typer.Option("30d"),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/analytics/weekly",
            params={"period": period},
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("sankey")
def get_sankey(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/analytics/sankey")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("interview-rounds")
def get_interview_rounds(
    ctx: typer.Context,
    period: str = typer.Option("all"),
    round_type: str | None = typer.Option(None),
) -> None:
    state = get_state(ctx)
    params = {"period": period}
    if round_type is not None:
        params["round_type"] = round_type
    try:
        payload = state.build_client().get_json(
            "/api/analytics/interview-rounds",
            params=params,
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("insights-configured")
def get_insights_configured(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/analytics/insights/configured")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("insights")
def get_insights(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, InsightsRequest)
    try:
        payload = state.build_client().post_json(
            "/api/analytics/insights",
            body=body,
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
