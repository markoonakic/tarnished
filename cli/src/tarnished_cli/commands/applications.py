from pathlib import Path

import typer

from tarnished_cli.client import CLIError
from tarnished_cli.input import load_model_body, require_yes
from tarnished_cli.models import (
    ApplicationCreate,
    ApplicationExtractRequest,
    ApplicationUpdate,
)
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import get_state

APPLICATIONS_HELP = """Manage job applications.

Examples:
  tarnished applications list --json
  tarnished applications create --body-file create-application.json
  tarnished applications delete app-123 --yes
"""


app = typer.Typer(help=APPLICATIONS_HELP)
history_app = typer.Typer(help="Inspect and modify application history.")
cv_app = typer.Typer(help="Manage CV documents.")
cover_letter_app = typer.Typer(help="Manage cover-letter documents.")
app.add_typer(history_app, name="history")
app.add_typer(cv_app, name="cv")
app.add_typer(cover_letter_app, name="cover-letter")


@app.command("list")
def list_applications(
    ctx: typer.Context,
    page: int = typer.Option(1),
    per_page: int = typer.Option(20),
    status_id: str | None = typer.Option(None),
    source: str | None = typer.Option(None),
    search: str | None = typer.Option(None),
    url: str | None = typer.Option(None),
    date_from: str | None = typer.Option(None),
    date_to: str | None = typer.Option(None),
) -> None:
    state = get_state(ctx)
    params = {
        "page": page,
        "per_page": per_page,
        "status_id": status_id,
        "source": source,
        "search": search,
        "url": url,
        "date_from": date_from,
        "date_to": date_to,
    }
    params = {key: value for key, value in params.items() if value is not None}
    try:
        payload = state.build_client().get_json(
            "/api/applications", params=params, auth="api_key"
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("get")
def get_application(ctx: typer.Context, application_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/applications/{application_id}",
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("create")
def create_application(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, ApplicationCreate)
    try:
        payload = state.build_client().post_json(
            "/api/applications",
            body=body,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("extract")
def extract_application(
    ctx: typer.Context,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, ApplicationExtractRequest)
    try:
        payload = state.build_client().post_json(
            "/api/applications/extract",
            body=body,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("update")
def update_application(
    ctx: typer.Context,
    application_id: str,
    body_file: Path = typer.Option(..., "--body-file", exists=True),
) -> None:
    state = get_state(ctx)
    body = load_model_body(body_file, ApplicationUpdate)
    try:
        payload = state.build_client().patch_json(
            f"/api/applications/{application_id}",
            body=body,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("delete")
def delete_application(
    ctx: typer.Context,
    application_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"application {application_id}")
    try:
        state.build_client().delete(f"/api/applications/{application_id}", auth="api_key")
        emit_result(
            state,
            {"deleted": True, "id": application_id},
            text=f"Deleted application {application_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("sources")
def list_sources(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            "/api/applications/sources",
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@history_app.command("list")
def list_history(ctx: typer.Context, application_id: str) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/applications/{application_id}/history",
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


@history_app.command("delete")
def delete_history_entry(
    ctx: typer.Context,
    application_id: str,
    history_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"history entry {history_id}")
    try:
        state.build_client().delete(
            f"/api/applications/{application_id}/history/{history_id}",
            auth="api_key",
        )
        emit_result(
            state,
            {"deleted": True, "id": history_id},
            text=f"Deleted history entry {history_id}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


def _upload_document(
    ctx: typer.Context,
    *,
    application_id: str,
    file_path: Path,
    doc_type: str,
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().post_file_json(
            f"/api/applications/{application_id}/{doc_type}",
            file_path=file_path,
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


def _delete_document(
    ctx: typer.Context,
    *,
    application_id: str,
    doc_type: str,
    yes: bool,
) -> None:
    state = get_state(ctx)
    require_yes(yes, resource=f"{doc_type} for application {application_id}")
    try:
        payload = state.build_client().delete_json(
            f"/api/applications/{application_id}/{doc_type}",
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


def _get_document_url(
    ctx: typer.Context,
    *,
    application_id: str,
    doc_type: str,
    disposition: str,
) -> None:
    state = get_state(ctx)
    try:
        payload = state.build_client().get_json(
            f"/api/files/{application_id}/{doc_type}/signed",
            params={"disposition": disposition},
            auth="api_key",
        )
        emit_result(state, payload)
    except CLIError as exc:
        exit_for_error(state, exc)


def _download_document(
    ctx: typer.Context,
    *,
    application_id: str,
    doc_type: str,
    output: Path,
    disposition: str,
) -> None:
    state = get_state(ctx)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        content, _headers = state.build_client().get_bytes(
            f"/api/files/{application_id}/{doc_type}",
            params={"disposition": disposition},
            auth="api_key",
        )
        output.write_bytes(content)
        emit_result(
            state,
            {"output_path": str(output), "bytes": len(content)},
            text=f"Downloaded {doc_type} to {output}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@cv_app.command("upload")
def upload_cv(
    ctx: typer.Context,
    application_id: str,
    file_path: Path = typer.Option(..., "--file", exists=True, dir_okay=False),
) -> None:
    _upload_document(
        ctx, application_id=application_id, file_path=file_path, doc_type="cv"
    )


@cv_app.command("delete")
def delete_cv(
    ctx: typer.Context,
    application_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    _delete_document(ctx, application_id=application_id, doc_type="cv", yes=yes)


@cv_app.command("url")
def get_cv_url(
    ctx: typer.Context,
    application_id: str,
    disposition: str = typer.Option("attachment"),
) -> None:
    _get_document_url(
        ctx,
        application_id=application_id,
        doc_type="cv",
        disposition=disposition,
    )


@cv_app.command("download")
def download_cv(
    ctx: typer.Context,
    application_id: str,
    output: Path = typer.Option(..., "--output"),
    disposition: str = typer.Option("attachment"),
) -> None:
    _download_document(
        ctx,
        application_id=application_id,
        doc_type="cv",
        output=output,
        disposition=disposition,
    )


@cover_letter_app.command("upload")
def upload_cover_letter(
    ctx: typer.Context,
    application_id: str,
    file_path: Path = typer.Option(..., "--file", exists=True, dir_okay=False),
) -> None:
    _upload_document(
        ctx,
        application_id=application_id,
        file_path=file_path,
        doc_type="cover-letter",
    )


@cover_letter_app.command("delete")
def delete_cover_letter(
    ctx: typer.Context,
    application_id: str,
    yes: bool = typer.Option(False, "--yes"),
) -> None:
    _delete_document(
        ctx,
        application_id=application_id,
        doc_type="cover-letter",
        yes=yes,
    )


@cover_letter_app.command("url")
def get_cover_letter_url(
    ctx: typer.Context,
    application_id: str,
    disposition: str = typer.Option("attachment"),
) -> None:
    _get_document_url(
        ctx,
        application_id=application_id,
        doc_type="cover-letter",
        disposition=disposition,
    )


@cover_letter_app.command("download")
def download_cover_letter(
    ctx: typer.Context,
    application_id: str,
    output: Path = typer.Option(..., "--output"),
    disposition: str = typer.Option("attachment"),
) -> None:
    _download_document(
        ctx,
        application_id=application_id,
        doc_type="cover-letter",
        output=output,
        disposition=disposition,
    )
