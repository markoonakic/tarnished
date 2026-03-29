from pathlib import Path

import typer

from tarnished_cli.client import CLIError
from tarnished_cli.output import emit_result, exit_for_error
from tarnished_cli.state import get_state

app = typer.Typer(help="Export Tarnished data.")


def _download_export(ctx: typer.Context, *, endpoint: str, output: Path) -> None:
    state = get_state(ctx)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        content, _headers = state.build_client().get_bytes(endpoint, auth="jwt")
        output.write_bytes(content)
        emit_result(
            state,
            {"output_path": str(output), "bytes": len(content)},
            text=f"Downloaded export to {output}",
        )
    except CLIError as exc:
        exit_for_error(state, exc)


@app.command("json")
def export_json(
    ctx: typer.Context,
    output: Path = typer.Option(..., "--output"),
) -> None:
    _download_export(ctx, endpoint="/api/export/json", output=output)


@app.command("csv")
def export_csv(
    ctx: typer.Context,
    output: Path = typer.Option(..., "--output"),
) -> None:
    _download_export(ctx, endpoint="/api/export/csv", output=output)


@app.command("zip")
def export_zip(
    ctx: typer.Context,
    output: Path = typer.Option(..., "--output"),
) -> None:
    _download_export(ctx, endpoint="/api/export/zip", output=output)
