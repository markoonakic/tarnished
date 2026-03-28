from pathlib import Path

import typer

from app.cli.client import CLIError
from app.cli.input import load_model_body, require_yes
from app.cli.output import emit_result, exit_for_error
from app.cli.state import get_state
from app.schemas.job_lead import JobLeadCreate

app = typer.Typer(help="Manage job leads.")


@app.command("list")
def list_job_leads(
    ctx: typer.Context,
    page: int = typer.Option(1),
    per_page: int = typer.Option(20),
    status: str | None = typer.Option(None),
    search: str | None = typer.Option(None),
    source: str | None = typer.Option(None),
    sort: str = typer.Option("newest"),
) -> None:
    state = get_state(ctx)
    params = {
        "page": page,
        "per_page": per_page,
        "status": status,
        "search": search,
        "source": source,
        "sort": sort,
    }
    params = {key: value for key, value in params.items() if value is not None}
    try:
        payload = state.build_client().get_json(
            "/api/job-leads", params=params, auth="flexible"
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("get")
def get_job_lead(ctx: typer.Context, job_lead_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/job-leads/{job_lead_id}",
            auth="jwt",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("create")
def create_job_lead(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, JobLeadCreate)
    try:
        payload = state.build_client().post_json(
            "/api/job-leads",
            body=body,
            auth="flexible",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("retry")
def retry_job_lead(ctx: typer.Context, job_lead_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_json(
            f"/api/job-leads/{job_lead_id}/retry",
            body={},
            auth="jwt",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("convert")
def convert_job_lead(ctx: typer.Context, job_lead_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_json(
            f"/api/job-leads/{job_lead_id}/convert",
            body={},
            auth="flexible",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("delete")
def delete_job_lead(
    ctx: typer.Context,
    job_lead_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"job lead {job_lead_id}")
    try:
        state.build_client().delete(f"/api/job-leads/{job_lead_id}", auth="jwt")
        emit_result(
            state,
            {"deleted": True, "id": job_lead_id},
            text=f"Deleted job lead {job_lead_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("sources")
def list_job_lead_sources(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/job-leads/sources",
            auth="flexible",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
