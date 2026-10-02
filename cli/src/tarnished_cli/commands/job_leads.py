from pathlib import Path
from typing import Any

import typer

from tarnished_cli.client import APIError, CLIError
from tarnished_cli.input import load_model_body, require_yes
from tarnished_cli.models import JobLeadCreate
from tarnished_cli.models.requests import JobLeadExtractRequest, JobLeadUpdate
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import AppState, get_state

JOB_LEADS_HELP = """Save first, edit incomplete leads, then explicitly extract or convert.

Save/create never fetches or calls AI. Retained source is at most 50,000 characters
including any truncation notice (input: text 100,000 / HTML 500,000 characters;
HTML preprocessing clips at 100,000). Inspect content_warning/source_truncated.
Processing is request-bound, not a durable background job. Extraction/retry may
call a paid provider; uncertain outcomes require GET before any explicit retry.
Saved IDs remain in successful bodies and API failure details; never recreate a
lead after an extraction failure. Conversion needs company/title, not AI.

Examples:
  tarnished job-leads create --body-file job-lead.json
  tarnished job-leads convert lead-123
  tarnished --json job-leads save --body-file job-lead.json
  tarnished --json job-leads edit lead-123 --body-file corrections.json
  tarnished --json job-leads extract lead-123 --expected-revision 1
  tarnished --json job-leads convert lead-123
"""


app = typer.Typer(help=JOB_LEADS_HELP)


def _exit_lead_mutation_error(state: AppState, exc: CLIError, lead_id: str) -> None:
    """Keep the known identity even when transport failure has no server body."""
    message = f"Lead {lead_id}: {exc}. Inspect with job-leads get before retrying; the request outcome may be uncertain."
    if state.json_output:
        payload: dict[str, Any] = {"error": message, "id": lead_id}
        if isinstance(exc, APIError):
            payload.update(status_code=exc.status_code, details=exc.payload)
        emit_result(state, payload)
        raise typer.Exit(code=1)
    exit_for_error(state, CLIError(message))


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
            "/api/job-leads", params=params, auth="api_key"
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
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command(
    "save",
    help="Save URL and optional source without fetching or AI (alias of create).",
)
@app.command("create", help="Save URL and optional source without fetching or AI.")
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
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("edit")
def edit_job_lead(
    ctx: typer.Context,
    job_lead_id: str,
    body_file: Path = typer.Option(
        ...,
        "--body-file",
        exists=True,
        help="Editable fields plus expected_revision. Omit unchanged; null clears scalars, [] clears lists.",
    ),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, JobLeadUpdate)
    try:
        payload = state.build_client().patch_json(
            f"/api/job-leads/{job_lead_id}", body=body, auth="api_key"
        )
        emit_result(state, payload)
    except CLIError as exc:
        _exit_lead_mutation_error(state, exc, job_lead_id)


@app.command(
    "extract", help="Explicit AI request. May call a paid provider; no automatic retry."
)
@app.command(
    "retry",
    help="Explicit retry. May repeat billed work; GET the current revision first.",
)
def extract_job_lead(
    ctx: typer.Context,
    job_lead_id: str,
    expected_revision: int = typer.Option(
        ..., min=0, help="Revision from the most recent GET/save/edit."
    ),
    restart_processing: bool = typer.Option(
        False,
        "--restart-processing",
        help="Acknowledge replacing a running/interrupted request: the previous call may still finish or have been billed, and restarting may repeat paid work.",
    ),
) -> None:
    state = get_state(ctx)
    body = JobLeadExtractRequest(
        expected_revision=expected_revision, restart_processing=restart_processing
    ).model_dump()
    try:
        payload = state.build_client().post_json(
            f"/api/job-leads/{job_lead_id}/{ctx.info_name}",
            body=body,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        _exit_lead_mutation_error(state, exc, job_lead_id)


@app.command("convert")
def convert_job_lead(ctx: typer.Context, job_lead_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_json(
            f"/api/job-leads/{job_lead_id}/convert",
            body={},
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        _exit_lead_mutation_error(state, exc, job_lead_id)


@app.command("delete")
def delete_job_lead(
    ctx: typer.Context,
    job_lead_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"job lead {job_lead_id}")
    try:
        state.build_client().delete(f"/api/job-leads/{job_lead_id}", auth="api_key")
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
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)
