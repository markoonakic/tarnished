"""Grounded feedback reports: interview, application and pipeline scopes.

Reads never dispatch a provider call. Requesting a report is an explicit mutation
that consumes the configured text capability and requires the same authority as
the web application.
"""

import time
from pathlib import Path

import typer

from tarnished_cli.client import CLIError, redact_credentials
from tarnished_cli.input import load_model_body
from tarnished_cli.models import PipelineReportRequest, ScopedReportRequest
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.polling import validate_wait_options
from tarnished_cli.state import get_state

REPORTS_HELP = """Read and request grounded feedback reports.

Reading returns the latest stored report for a scope and never contacts a model
provider. Requesting creates a bounded job; poll it with --wait or re-read later.

Examples:
  tarnished --json reports interview get rd-123
  tarnished --json reports application get app-123
  tarnished --json reports pipeline get --period 30d
  tarnished reports interview request rd-123 --body-file intent.json
  tarnished reports pipeline request --body-file intent.json --wait
"""


app = typer.Typer(help=REPORTS_HELP)
interview_app = typer.Typer(help="Interview-scope feedback for a round.")
application_app = typer.Typer(help="Application-scope feedback for an application.")
pipeline_app = typer.Typer(help="Pipeline-scope feedback for the account.")
app.add_typer(interview_app, name="interview")
app.add_typer(application_app, name="application")
app.add_typer(pipeline_app, name="pipeline")


@interview_app.command("get")
def get_interview_report(ctx: typer.Context, round_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/rounds/{round_id}/interview-feedback"
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@interview_app.command("request")
def request_interview_report(
    ctx: typer.Context,
    round_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
    wait: bool = typer.Option(
        False, "--wait", help="Poll the report read until the job is terminal."
    ),
    poll_interval: float = typer.Option(1.0, "--poll-interval"),
    timeout_seconds: float = typer.Option(300.0, "--timeout-seconds"),
) -> None:
    body = load_model_body(body_file, ScopedReportRequest)
    _post_report(
        ctx,
        path=f"/api/rounds/{round_id}/interview-feedback",
        read_path=f"/api/rounds/{round_id}/interview-feedback",
        body=body,
        wait=wait,
        poll_interval=poll_interval,
        timeout_seconds=timeout_seconds,
    )


@application_app.command("get")
def get_application_report(ctx: typer.Context, application_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/applications/{application_id}/feedback"
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@application_app.command("request")
def request_application_report(
    ctx: typer.Context,
    application_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
    wait: bool = typer.Option(
        False, "--wait", help="Poll the report read until the job is terminal."
    ),
    poll_interval: float = typer.Option(1.0, "--poll-interval"),
    timeout_seconds: float = typer.Option(300.0, "--timeout-seconds"),
) -> None:
    body = load_model_body(body_file, ScopedReportRequest)
    _post_report(
        ctx,
        path=f"/api/applications/{application_id}/feedback",
        read_path=f"/api/applications/{application_id}/feedback",
        body=body,
        wait=wait,
        poll_interval=poll_interval,
        timeout_seconds=timeout_seconds,
    )


@pipeline_app.command("get")
def get_pipeline_report(
    ctx: typer.Context,
    period: str = typer.Option("30d"),
    as_of: str | None = typer.Option(None, help="ISO timestamp with timezone offset"),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/analytics/feedback",
            params={"period": period, **({"as_of": as_of} if as_of else {})},
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@pipeline_app.command("request")
def request_pipeline_report(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
    wait: bool = typer.Option(
        False, "--wait", help="Poll the report read until the job is terminal."
    ),
    poll_interval: float = typer.Option(1.0, "--poll-interval"),
    timeout_seconds: float = typer.Option(300.0, "--timeout-seconds"),
) -> None:
    body = load_model_body(body_file, PipelineReportRequest)
    read_path = "/api/analytics/feedback"
    period = body.get("period", "30d")
    params = {
        "period": period,
        **({"as_of": body["as_of"]} if body.get("as_of") else {}),
    }
    _post_report(
        ctx,
        path=read_path,
        read_path=read_path,
        body=body,
        wait=wait,
        poll_interval=poll_interval,
        timeout_seconds=timeout_seconds,
        params=params,
    )


def _post_report(
    ctx: typer.Context,
    *,
    path: str,
    read_path: str,
    body: dict,
    wait: bool,
    poll_interval: float,
    timeout_seconds: float,
    params: dict | None = None,
) -> None:
    """Submit once, then poll the same job within the wait timeout."""
    state = get_state(ctx)
    client = None
    try:
        validate_wait_options(poll_interval, timeout_seconds)

        client = state.build_client()
        payload = client.post_json(path, body=body)
        if not wait:
            emit_result(state, payload)
            return

        if not isinstance(payload, dict) or not isinstance(payload.get("id"), str):
            raise CLIError("Unexpected report start response: missing job id.")
        job_id = payload["id"]
        deadline = time.monotonic() + timeout_seconds
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CLIError(
                    "Timed out waiting for the report; re-read it later with "
                    "'reports <scope> get'."
                )
            snapshot = client.get_json(
                read_path, params=params, timeout=min(30.0, remaining)
            )
            if not isinstance(snapshot, dict):
                raise CLIError("Unexpected report status response.")
            job = snapshot.get("job")
            if not isinstance(job, dict):
                raise CLIError(
                    "No report job is recorded for this scope; re-read the report "
                    "to see whether one is still running."
                )
            if job.get("id") != job_id:
                raise CLIError(
                    "The latest report job changed while waiting. "
                    "Re-read the report to review its current state."
                )
            state_name = job.get("state")
            if not isinstance(state_name, str):
                raise CLIError("Unexpected report status response.")
            if state_name == "complete":
                emit_result(state, snapshot)
                return
            if state_name in ("failed", "interrupted", "invalidated"):
                detail = job.get("error") or "No details returned."
                raise CLIError(
                    redact_credentials(
                        f"Report job {job.get('id')} {state_name}: {detail}",
                        state.tokens.api_key,
                    )
                )
            remaining = deadline - time.monotonic()
            if remaining > 0:
                time.sleep(min(poll_interval, remaining))
    except CLIError as exc:
        exit_for_error(state, exc)
    finally:
        if client is not None:
            client.close()
