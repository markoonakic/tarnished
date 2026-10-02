import json

import httpx
import pytest

import tarnished_cli.commands.imports as imports
from tarnished_cli.main import app


@pytest.fixture
def clock(monkeypatch):
    class Clock:
        now = 100.0
        sleeps = []

        def sleep(self, duration):
            assert duration > 0
            self.sleeps.append(duration)
            self.now += duration

    clock = Clock()
    monkeypatch.setattr(imports.time, "monotonic", lambda: clock.now)
    monkeypatch.setattr(imports.time, "sleep", clock.sleep)
    return clock


def run_wait(runner, tmp_path, *options):
    archive = tmp_path / "archive.zip"
    archive.write_bytes(b"fake archive")
    return runner.invoke(
        app, ["--json", "import", "run", "--file", str(archive), "--wait", *options]
    )


@pytest.mark.parametrize("terminal", ["complete", "failed", "cancelled"])
def test_wait_handles_backend_terminal_status(
    terminal, clock, mock_server, runner, tmp_path
):
    seen = []

    def handler(request):
        seen.append(request)
        if request.method == "POST":
            return httpx.Response(
                202, json={"import_id": "job-123", "status": "queued"}
            )
        if len(seen) == 2:
            return httpx.Response(200, json={"status": "processing"})
        return httpx.Response(
            200,
            json={
                "status": terminal,
                "message": "Archive validation outcome",
                "error": {"error": "Bad reference"} if terminal == "failed" else None,
            },
        )

    mock_server(handler)
    result = run_wait(runner, tmp_path)
    assert result.exit_code == (0 if terminal == "complete" else 1)
    payload = json.loads(result.stdout)
    if terminal == "complete":
        assert payload["status"] == terminal
    else:
        assert terminal in payload["error"]
        assert "Archive validation outcome" in payload["error"]
        assert "Timed out" not in result.stdout
    assert result.stderr == ""
    assert len(seen) == 3
    assert clock.sleeps == [1.0]


@pytest.mark.parametrize("option", ["--timeout-seconds", "--poll-interval"])
@pytest.mark.parametrize("value", ["0", "-1", "nan", "inf", "-inf"])
def test_wait_values_rejected_before_upload(
    option, value, mock_server, runner, tmp_path
):
    def handler(request):
        pytest.fail("Invalid wait values must not start an import")

    mock_server(handler)
    result = run_wait(runner, tmp_path, option, value)
    assert result.exit_code == 1
    assert option in json.loads(result.stdout)["error"]
    assert result.stderr == ""


def test_wait_does_not_oversleep_or_poll_after_deadline(
    clock, mock_server, runner, tmp_path
):
    seen = []

    def handler(request):
        seen.append(request)
        if request.method == "POST":
            return httpx.Response(202, json={"import_id": "job-123"})
        assert request.extensions["timeout"]["read"] <= 0.25
        return httpx.Response(200, json={"status": "processing"})

    mock_server(handler)
    result = run_wait(
        runner, tmp_path, "--poll-interval", "10", "--timeout-seconds", "0.25"
    )
    assert result.exit_code == 1
    assert "Timed out" in json.loads(result.stdout)["error"]
    assert clock.sleeps == [0.25]
    assert clock.now == 100.25
    assert len(seen) == 2


@pytest.mark.parametrize(
    "payload", [None, [], {}, {"status": "unknown"}, {"status": []}]
)
def test_wait_invalid_status_is_actionable(
    payload, clock, mock_server, runner, tmp_path
):
    def handler(request):
        if request.method == "POST":
            return httpx.Response(202, json={"import_id": "job-123"})
        return httpx.Response(
            200,
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    mock_server(handler)
    result = run_wait(runner, tmp_path)
    assert result.exit_code == 1
    assert "response" in json.loads(result.stdout)["error"]
    assert clock.sleeps == []


@pytest.mark.parametrize("payload", [None, [], {}, {"import_id": 123}])
def test_wait_invalid_start_response_is_actionable(
    payload, clock, mock_server, runner, tmp_path
):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(
            202,
            content=json.dumps(payload),
            headers={"content-type": "application/json"},
        )

    mock_server(handler)
    result = run_wait(runner, tmp_path)
    assert result.exit_code == 1
    assert "start response" in json.loads(result.stdout)["error"]
    assert len(seen) == 1


def test_wait_failure_detail_does_not_echo_credentials(
    clock, mock_server, runner, tmp_path
):
    def handler(request):
        if request.method == "POST":
            return httpx.Response(202, json={"import_id": "job-123"})
        return httpx.Response(
            200,
            json={
                "status": "failed",
                "error": {
                    "error": "test-only-api-key https://user:password@other.test"
                },
            },
        )

    mock_server(handler)
    result = run_wait(runner, tmp_path)
    assert result.exit_code == 1
    assert "failed" in json.loads(result.stdout)["error"]
    assert "test-only-api-key" not in result.output
    assert "password" not in result.output
    assert clock.sleeps == []
