import json

import httpx
import pytest

import tarnished_cli.commands.reports as reports
from tarnished_cli.main import app


@pytest.fixture
def clock(monkeypatch):
    class Clock:
        now = 100.0
        sleeps = []

        def sleep(self, duration):
            self.sleeps.append(duration)
            self.now += duration

    clock = Clock()
    monkeypatch.setattr(reports.time, "monotonic", lambda: clock.now)
    monkeypatch.setattr(reports.time, "sleep", clock.sleep)
    return clock


def run_wait(runner, tmp_path, *options):
    body = tmp_path / "intent.json"
    body.write_text(json.dumps({"intent_id": "intent-1", "config_revision": "rev-1"}))
    return runner.invoke(
        app,
        [
            "--json",
            "reports",
            "pipeline",
            "request",
            "--body-file",
            str(body),
            "--wait",
            *options,
        ],
    )


@pytest.mark.parametrize(
    "outcome", ["complete", "failed", "interrupted", "invalidated"]
)
def test_report_wait_tracks_the_submitted_job(
    outcome, clock, mock_server, runner, tmp_path
):
    seen = []

    def handler(request):
        seen.append(request)
        if request.method == "POST":
            return httpx.Response(202, json={"id": "job-1", "state": "queued"})
        state = "queued" if len(seen) == 2 else outcome
        return httpx.Response(200, json={"job": {"id": "job-1", "state": state}})

    mock_server(handler)
    result = run_wait(runner, tmp_path)
    assert result.exit_code == (0 if outcome == "complete" else 1)
    payload = json.loads(result.stdout)
    if outcome == "complete":
        assert payload["job"]["id"] == "job-1"
    else:
        assert outcome in payload["error"]
    assert clock.sleeps == [1.0]


def test_report_wait_does_not_accept_a_different_job(
    clock, mock_server, runner, tmp_path
):
    def handler(request):
        if request.method == "POST":
            return httpx.Response(202, json={"id": "job-1", "state": "queued"})
        return httpx.Response(200, json={"job": {"id": "job-2", "state": "complete"}})

    mock_server(handler)
    result = run_wait(runner, tmp_path)
    assert result.exit_code == 1
    assert "job changed" in json.loads(result.stdout)["error"]
    assert clock.sleeps == []


def test_report_wait_caps_network_timeout_and_stops_at_deadline(
    clock, mock_server, runner, tmp_path
):
    seen = []

    def handler(request):
        seen.append(request)
        if request.method == "POST":
            return httpx.Response(202, json={"id": "job-1", "state": "queued"})
        assert request.extensions["timeout"]["read"] == 0.25
        return httpx.Response(200, json={"job": {"id": "job-1", "state": "queued"}})

    mock_server(handler)
    result = run_wait(
        runner, tmp_path, "--poll-interval", "10", "--timeout-seconds", "0.25"
    )
    assert result.exit_code == 1
    assert "Timed out" in json.loads(result.stdout)["error"]
    assert len(seen) == 2
    assert clock.sleeps == [0.25]


def test_report_wait_rejects_invalid_options_before_submission(
    clock, mock_server, runner, tmp_path
):
    mock_server(
        lambda request: pytest.fail("Invalid wait options must not submit a report")
    )
    result = run_wait(runner, tmp_path, "--timeout-seconds", "nan")
    assert result.exit_code == 1
    assert "--timeout-seconds" in json.loads(result.stdout)["error"]
