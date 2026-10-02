import json

import httpx
import pytest

from tarnished_cli.main import app


@pytest.mark.parametrize(
    "endpoint", ["kpis", "pipeline", "activity", "weekly", "sankey", "interview-rounds"]
)
def test_scoped_analytics_reads_forward_period_and_as_of(runner, mock_server, endpoint):
    def handler(request):
        assert request.method == "GET"
        assert request.url.path == f"/api/analytics/{endpoint}"
        assert dict(request.url.params) == {
            "period": "all",
            "as_of": "2026-01-07T09:00:00Z",
        }
        return httpx.Response(200, json={"denominator": 10, "responded": 4})

    mock_server(handler)
    result = runner.invoke(
        app,
        [
            "--json",
            "analytics",
            endpoint,
            "--period",
            "all",
            "--as-of",
            "2026-01-07T09:00:00Z",
        ],
    )
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["denominator"] == 10


@pytest.mark.parametrize(
    "command,path,body",
    [
        (
            ["applications", "correct-meaning", "app"],
            "/api/applications/app/meaning",
            {"meaning": "rejected", "expected_revision": 3},
        ),
        (
            ["applications", "history", "correct", "app", "event"],
            "/api/applications/app/history/event",
            {
                "to_meaning": "interviewing",
                "expected_revision": 3,
                "changed_at": "2026-01-03T09:00:00Z",
            },
        ),
        (
            ["analytics", "insights"],
            "/api/analytics/insights",
            {"period": "all", "as_of": "2026-01-07T09:00:00Z"},
        ),
    ],
)
def test_explicit_bodies_and_permission_denial(
    runner, mock_server, tmp_path, command, path, body
):
    file = tmp_path / "body.json"
    file.write_text(json.dumps(body))
    denied = False

    def handler(request):
        assert request.url.path == path
        assert json.loads(request.content) == body
        return httpx.Response(
            403 if denied else 200,
            json={"detail": "Forbidden"} if denied else {"saved": True},
        )

    mock_server(handler)
    args = ["--json", *command, "--body-file", str(file)]
    result = runner.invoke(app, args)
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == {"saved": True}
    denied = True
    result = runner.invoke(app, args)
    assert result.exit_code != 0


def test_history_delete_revision(runner, mock_server):
    def handler(request):
        assert request.method == "DELETE"
        assert request.url.params["expected_revision"] == "3"
        return httpx.Response(204)

    mock_server(handler)
    result = runner.invoke(
        app,
        [
            "applications",
            "history",
            "delete",
            "app",
            "event",
            "--expected-revision",
            "3",
            "--yes",
        ],
    )
    assert result.exit_code == 0, result.output


def test_documented_evidence_commands_execute(runner, mock_server, monkeypatch):
    import re
    import shlex
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    guide = (
        (root / "documentation/content/how-to/use-the-cli.md")
        .read_text()
        .split("## Recorded evidence and scoped analytics")[1]
        .split("## Grounded reports")[0]
    )
    examples = [
        line
        for block in re.findall(r"```bash\n(.*?)```", guide, re.S)
        for line in block.splitlines()
        if line.startswith("tarnished ")
    ]
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        assert request.url.path.startswith(("/api/applications/", "/api/analytics/"))
        assert not request.url.path.endswith("/insights")
        return httpx.Response(200, json={"synthetic": True})

    mock_server(handler)
    monkeypatch.chdir(root)
    assert len(examples) == 9
    for example in examples:
        args = shlex.split(
            example.replace("$APP_ID", "app").replace("$EVENT_ID", "event")
        )[1:]
        result = runner.invoke(app, args)
        assert result.exit_code == 0, (example, result.output)
        json.loads(result.stdout)
    assert [method for method, _ in seen] == ["GET"] * 5 + ["PATCH"] * 4


def test_documented_report_and_document_commands_execute(
    runner, mock_server, monkeypatch, tmp_path
):
    """The grounded-report/document examples must run, and reads must not POST."""
    import re
    import shlex
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    guide = (root / "documentation/content/how-to/use-the-cli.md").read_text()
    section = guide.split("## Grounded reports")[1].split("## ")[0]
    examples = [
        line
        for block in re.findall(r"```bash\n(.*?)```", section, re.S)
        for line in block.splitlines()
        if line.startswith("tarnished ")
    ]
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        assert request.url.path.startswith(
            (
                "/api/applications/",
                "/api/analytics/",
                "/api/rounds/",
            )
        )
        assert not request.url.path.endswith("/insights")
        return httpx.Response(200, json={"synthetic": True})

    mock_server(handler)
    monkeypatch.chdir(root)
    assert len(examples) == 12
    for example in examples:
        args = shlex.split(
            example.replace('"$APP_ID"', "app")
            .replace('"$ROUND_ID"', "round")
            .replace("$APP_ID", "app")
            .replace("$ROUND_ID", "round")
        )[1:]
        result = runner.invoke(app, args)
        assert result.exit_code == 0, (example, result.output)
        json.loads(result.stdout)
    # Six reads never dispatch; six explicit requests/writes are non-GET.
    # Reads: 3 report scopes + cv/cover-letter text + transcript get.
    # Writes: 3 report requests + cv paste-text + transcript paste/edit.
    methods = [method for method, _ in seen]
    assert len([m for m in methods if m == "GET"]) == 6, methods
    assert sorted(m for m in methods if m != "GET") == [
        "PATCH",
        "POST",
        "POST",
        "POST",
        "PUT",
        "PUT",
    ], methods


def test_documented_transcription_commands_execute(runner, mock_server, monkeypatch):
    """The transcription examples must run, and status reads must not dispatch."""
    import re
    import shlex
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    guide = (root / "documentation/content/how-to/use-the-cli.md").read_text()
    section = guide.split("## Speech transcription jobs")[1].split("\n## ")[0]
    examples = [
        line
        for block in re.findall(r"```bash\n(.*?)```", section, re.S)
        for line in block.splitlines()
        if "transcriptions" in line
    ]
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        assert request.url.path.startswith(
            ("/api/ai-capabilities", "/api/rounds/", "/api/transcriptions/")
        )
        if request.url.path.startswith("/api/ai-capabilities"):
            return httpx.Response(200, json={"text": {}, "speech": {}})
        if request.method == "GET":
            # A round listing is empty; a job read is terminal so --wait returns.
            return httpx.Response(
                200,
                json=[]
                if request.url.path.endswith("/transcriptions")
                else {"id": "job", "state": "complete", "completed_chunks": 1},
            )
        # A start/retry POST returns an immediately-terminal job.
        return httpx.Response(
            200, json={"id": "job", "state": "complete", "completed_chunks": 1}
        )

    mock_server(handler)
    monkeypatch.chdir(root)
    assert examples, "no transcription examples were found"
    for example in examples:
        args = shlex.split(
            example.replace('"$ROUND_ID"', "round")
            .replace('"$MEDIA_ID"', "media")
            .replace('"$JOB_ID"', "job")
            .replace('"$REV"', "rev-1")
        )[1:]
        result = runner.invoke(app, args)
        assert result.exit_code == 0, (example, result.output)
        json.loads(result.stdout)
    # Capability/list/get are reads; the doc's start, retry and shared --wait
    # start example are the three non-read calls. Reads never dispatch work.
    transcription_calls = [
        (m, p)
        for m, p in seen
        if p.startswith(
            ("/api/ai-capabilities", "/api/rounds/", "/api/transcriptions/")
        )
    ]
    reads = [m for m, _ in transcription_calls if m == "GET"]
    writes = [m for m, _ in transcription_calls if m == "POST"]
    assert len(reads) == 3, seen
    assert len(writes) == 3, seen
    # A transcription start is always a POST, never a read.
    assert all(
        m == "POST" for m, p in transcription_calls if p.endswith("/transcription")
    )
    assert not any(path.endswith("/transcription") and m != "POST" for m, path in seen)
