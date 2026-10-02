"""Speech transcription jobs: capability visibility, start, status, retry, wait.

Reads and capability checks never dispatch work. Starting or retrying a
transcription is an explicit mutation that sends the recording to the configured
speech service and requires files:write; a plain status read needs only
files:read and rounds:read.
"""

import time
from uuid import uuid4

import typer

from tarnished_cli.client import CLIError, redact_credentials
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.polling import validate_wait_options
from tarnished_cli.state import get_state

TRANSCRIPTIONS_HELP = """Start and inspect speech transcription jobs.

Transcription runs on the installation's configured speech service. Starting a
job sends the recording to that service, so it needs files:write; status reads
need only files:read and rounds:read. Reads never dispatch work.

Examples:
  tarnished --json transcriptions capabilities
  tarnished --json transcriptions list rd-123
  tarnished --json transcriptions get job-123
  tarnished --json transcriptions start rd-123 media-123 --speech-configuration-revision rev-1
  tarnished --json transcriptions retry job-123
"""

app = typer.Typer(help=TRANSCRIPTIONS_HELP)

# Only these stop a wait loop; everything else keeps polling until the deadline.
TERMINAL_STATES = ("complete", "failed", "interrupted", "invalidated")


@app.command("capabilities")
def get_capabilities(ctx: typer.Context) -> None:
    """Show installation text/speech capability disclosure; never dispatches."""
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json("/api/ai-capabilities")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("list")
def list_transcriptions(ctx: typer.Context, round_id: str) -> None:
    """List recent transcription jobs for a round (newest first)."""
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/rounds/{round_id}/transcriptions"
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("get")
def get_transcription(ctx: typer.Context, job_id: str) -> None:
    """Read one transcription job's state, progress and sanitized error."""
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(f"/api/transcriptions/{job_id}")
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("start")
def start_transcription(
    ctx: typer.Context,
    round_id: str,
    media_id: str,
    speech_configuration_revision: str = typer.Option(
        ...,
        "--speech-configuration-revision",
        help="Speech configuration revision from 'transcriptions capabilities'.",
    ),
    expected_transcript_generation: int = typer.Option(
        0, "--expected-generation", min=0, help="Transcript generation to replace."
    ),
    intent_id: str | None = typer.Option(
        None, "--intent-id", help="Stable idempotency id (otherwise generated)."
    ),
    wait: bool = typer.Option(False, "--wait", help="Poll until the job is terminal."),
    poll_interval: float = typer.Option(1.0, "--poll-interval"),
    timeout_seconds: float = typer.Option(300.0, "--timeout-seconds"),
) -> None:
    """Start transcription for a round media item.

    The recording is sent to the configured speech service. Reusing an intent id
    makes a repeated request after an ambiguous failure safe.
    """
    _request_transcription(
        ctx,
        path=f"/api/rounds/{round_id}/media/{media_id}/transcription",
        headers={
            "Request-Intent": intent_id or str(uuid4()),
            "Expected-Transcript-Generation": str(expected_transcript_generation),
            "Speech-Configuration-Revision": speech_configuration_revision,
        },
        wait=wait,
        poll_interval=poll_interval,
        timeout_seconds=timeout_seconds,
    )


@app.command("retry")
def retry_transcription(
    ctx: typer.Context,
    job_id: str,
    intent_id: str | None = typer.Option(
        None, "--intent-id", help="Stable idempotency id (otherwise generated)."
    ),
    wait: bool = typer.Option(False, "--wait", help="Poll until the job is terminal."),
    poll_interval: float = typer.Option(1.0, "--poll-interval"),
    timeout_seconds: float = typer.Option(300.0, "--timeout-seconds"),
) -> None:
    """Explicitly retry a failed or interrupted transcription.

    Remote work and charges may already have occurred; completed chunks may be
    reused rather than re-sent.
    """
    _request_transcription(
        ctx,
        path=f"/api/transcriptions/{job_id}/retry",
        headers={"Request-Intent": intent_id or str(uuid4())},
        wait=wait,
        poll_interval=poll_interval,
        timeout_seconds=timeout_seconds,
    )


def _request_transcription(
    ctx: typer.Context,
    *,
    path: str,
    headers: dict[str, str],
    wait: bool,
    poll_interval: float,
    timeout_seconds: float,
) -> None:
    """Submit once, then optionally poll the returned job ID."""
    state = get_state(ctx)
    client = None
    try:
        validate_wait_options(poll_interval, timeout_seconds)
        client = state.build_client()
        status = client.post_json(path, body=None, headers=headers)
        if not wait:
            emit_result(state, status)
            return

        if not isinstance(status, dict) or not isinstance(status.get("id"), str):
            raise CLIError("Unexpected transcription start response: missing job id.")
        job_id = status["id"]
        deadline = time.monotonic() + timeout_seconds
        while True:
            current = status.get("state")
            if not isinstance(current, str):
                raise CLIError("Unexpected transcription status response.")
            if current == "complete":
                emit_result(state, status)
                return
            if current in TERMINAL_STATES:
                detail = status.get("error") or status.get("stage") or "No details."
                raise CLIError(
                    redact_credentials(
                        f"Transcription {job_id} {current}: {detail}",
                        state.tokens.api_key,
                    )
                )
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CLIError(
                    f"Timed out waiting for transcription {job_id}; "
                    "re-read its status later with 'transcriptions get'."
                )
            time.sleep(min(poll_interval, remaining))
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                continue
            status = client.get_json(
                f"/api/transcriptions/{job_id}", timeout=min(30.0, remaining)
            )
            if not isinstance(status, dict):
                raise CLIError("Unexpected transcription status response.")
    except CLIError as exc:
        exit_for_error(state, exc)
    finally:
        if client is not None:
            client.close()
