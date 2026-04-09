from pathlib import Path

import typer

from tarnished_cli.client import CLIError
from tarnished_cli.input import load_model_body, require_yes
from tarnished_cli.models import RoundCreate, RoundUpdate
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import get_state

app = typer.Typer(help="Manage interview rounds.")
media_app = typer.Typer(help="Manage round media files.")
transcript_app = typer.Typer(help="Manage round transcripts.")
app.add_typer(media_app, name="media")
app.add_typer(transcript_app, name="transcript")


@app.command("create")
def create_round(
    ctx: typer.Context,
    application_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, RoundCreate)
    try:
        payload = state.build_client().post_json(
            f"/api/applications/{application_id}/rounds",
            body=body,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("update")
def update_round(
    ctx: typer.Context,
    round_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, RoundUpdate)
    try:
        payload = state.build_client().patch_json(
            f"/api/rounds/{round_id}",
            body=body,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("delete")
def delete_round(
    ctx: typer.Context,
    round_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"round {round_id}")
    try:
        state.build_client().delete(f"/api/rounds/{round_id}", auth="api_key")
        emit_result(
            state,
            {"deleted": True, "id": round_id},
            text=f"Deleted round {round_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@media_app.command("upload")
def upload_media(
    ctx: typer.Context,
    round_id: str,
    file_path: Path = typer.Option(..., "--file", exists=True, dir_okay=False),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_file_json(
            f"/api/rounds/{round_id}/media",
            file_path=file_path,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@media_app.command("delete")
def delete_media(
    ctx: typer.Context,
    media_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"media {media_id}")
    try:
        state.build_client().delete(f"/api/media/{media_id}", auth="api_key")
        emit_result(
            state,
            {"deleted": True, "id": media_id},
            text=f"Deleted media {media_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@media_app.command("url")
def get_media_url(
    ctx: typer.Context,
    media_id: str,
    disposition: str = typer.Option("attachment"),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/files/media/{media_id}/signed",
            params={"disposition": disposition},
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@media_app.command("download")
def download_media(
    ctx: typer.Context,
    media_id: str,
    output: Path = typer.Option(..., "--output"),
    disposition: str = typer.Option("attachment"),
) -> None:
    state = get_state(ctx)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        content, _headers = state.build_client().get_bytes(
            f"/api/files/media/{media_id}",
            params={"disposition": disposition},
            auth="api_key",
        )
        output.write_bytes(content)
        emit_result(
            state,
            {"output_path": str(output), "bytes": len(content)},
            text=f"Downloaded media to {output}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@transcript_app.command("upload")
def upload_transcript(
    ctx: typer.Context,
    round_id: str,
    file_path: Path = typer.Option(..., "--file", exists=True, dir_okay=False),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_file_json(
            f"/api/rounds/{round_id}/transcript",
            file_path=file_path,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@transcript_app.command("delete")
def delete_transcript(
    ctx: typer.Context,
    round_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"transcript for round {round_id}")
    try:
        state.build_client().delete(
            f"/api/rounds/{round_id}/transcript", auth="api_key"
        )
        emit_result(
            state,
            {"deleted": True, "round_id": round_id},
            text=f"Deleted transcript for round {round_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@transcript_app.command("url")
def get_transcript_url(
    ctx: typer.Context,
    round_id: str,
    disposition: str = typer.Option("attachment"),
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/files/rounds/{round_id}/transcript/signed",
            params={"disposition": disposition},
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@transcript_app.command("download")
def download_transcript(
    ctx: typer.Context,
    round_id: str,
    output: Path = typer.Option(..., "--output"),
    disposition: str = typer.Option("attachment"),
) -> None:
    state = get_state(ctx)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        content, _headers = state.build_client().get_bytes(
            f"/api/files/rounds/{round_id}/transcript",
            params={"disposition": disposition},
            auth="api_key",
        )
        output.write_bytes(content)
        emit_result(
            state,
            {"output_path": str(output), "bytes": len(content)},
            text=f"Downloaded transcript to {output}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)
