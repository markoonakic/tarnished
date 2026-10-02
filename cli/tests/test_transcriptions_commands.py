"""Transcription capability, start, status, retry and wait commands."""

import json

import pytest

import tarnished_cli.state as state_module
from tarnished_cli.client import APIError
from tarnished_cli.main import app


class FakeTranscriptionsClient:
    def __init__(self, *, states=("queued", "complete"), fail_post=None):
        self.calls = []
        self._states = list(states)
        self._fail_post = fail_post
        self.closed = False

    def get_json(
        self, path, *, params=None, auth="api_key", timeout=30.0, headers=None
    ):
        self.calls.append(("GET", path))
        if path == "/api/ai-capabilities":
            return {
                "text": {"available": False, "configuration_status": "incomplete"},
                "speech": {
                    "available": False,
                    "configuration_status": "disabled",
                    "configuration_revision": "0",
                },
            }
        if path == "/api/rounds/rd-1/transcriptions":
            return [{"id": "job-1", "state": "complete", "completed_chunks": 2}]
        if path == "/api/transcriptions/job-1":
            state = self._states.pop(0) if self._states else "complete"
            return {"id": "job-1", "state": state, "completed_chunks": 1}
        raise AssertionError(f"Unexpected GET path: {path}")

    def post_json(self, path, *, body, auth="api_key", headers=None):
        self.calls.append(("POST", path, body, headers))
        if self._fail_post is not None:
            raise self._fail_post
        return {"id": "job-1", "state": "queued", "completed_chunks": 0}

    def close(self):
        self.closed = True


def _install(monkeypatch, client):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: client,
    )
    return client


def test_capabilities_is_a_get_and_never_dispatches(
    runner, cli_config_dir, monkeypatch
):
    client = _install(monkeypatch, FakeTranscriptionsClient())
    result = runner.invoke(app, ["--json", "transcriptions", "capabilities"])
    assert result.exit_code == 0, result.output
    assert client.calls == [("GET", "/api/ai-capabilities")]
    assert json.loads(result.output)["speech"]["configuration_status"] == "disabled"


def test_list_and_get_are_reads(runner, cli_config_dir, monkeypatch):
    client = _install(monkeypatch, FakeTranscriptionsClient())
    listed = runner.invoke(app, ["--json", "transcriptions", "list", "rd-1"])
    assert listed.exit_code == 0, listed.output
    fetched = runner.invoke(app, ["--json", "transcriptions", "get", "job-1"])
    assert fetched.exit_code == 0, fetched.output
    assert [call[0] for call in client.calls] == ["GET", "GET"]


def test_start_sends_the_three_required_headers(runner, cli_config_dir, monkeypatch):
    client = _install(monkeypatch, FakeTranscriptionsClient())
    result = runner.invoke(
        app,
        [
            "--json",
            "transcriptions",
            "start",
            "rd-1",
            "media-1",
            "--speech-configuration-revision",
            "rev-7",
            "--expected-generation",
            "3",
            "--intent-id",
            "11111111-1111-1111-1111-111111111111",
        ],
    )
    assert result.exit_code == 0, result.output
    method, path, _body, headers = client.calls[0]
    assert (method, path) == (
        "POST",
        "/api/rounds/rd-1/media/media-1/transcription",
    )
    assert headers == {
        "Request-Intent": "11111111-1111-1111-1111-111111111111",
        "Expected-Transcript-Generation": "3",
        "Speech-Configuration-Revision": "rev-7",
    }


def test_start_without_wait_does_not_poll(runner, cli_config_dir, monkeypatch):
    client = _install(monkeypatch, FakeTranscriptionsClient())
    result = runner.invoke(
        app,
        [
            "--json",
            "transcriptions",
            "start",
            "rd-1",
            "media-1",
            "--speech-configuration-revision",
            "rev-7",
        ],
    )
    assert result.exit_code == 0, result.output
    assert [call[0] for call in client.calls] == ["POST"]


def test_wait_polls_until_complete_with_a_finite_timeout(
    runner, cli_config_dir, monkeypatch
):
    client = _install(
        monkeypatch, FakeTranscriptionsClient(states=["preparing", "complete"])
    )
    result = runner.invoke(
        app,
        [
            "--json",
            "transcriptions",
            "start",
            "rd-1",
            "media-1",
            "--speech-configuration-revision",
            "rev-7",
            "--wait",
            "--poll-interval",
            "0.01",
            "--timeout-seconds",
            "5",
        ],
    )
    assert result.exit_code == 0, result.output
    assert [call[0] for call in client.calls] == ["POST", "GET", "GET"]
    assert json.loads(result.output)["state"] == "complete"


def test_wait_does_not_poll_after_a_sleep_reaches_the_deadline(
    runner, cli_config_dir, monkeypatch
):
    import tarnished_cli.commands.transcriptions as commands

    client = _install(monkeypatch, FakeTranscriptionsClient(states=["complete"]))
    now = [100.0]
    monkeypatch.setattr(commands.time, "monotonic", lambda: now[0])

    def sleep(duration):
        now[0] += duration

    monkeypatch.setattr(commands.time, "sleep", sleep)
    result = runner.invoke(
        app,
        [
            "--json",
            "transcriptions",
            "retry",
            "job-1",
            "--wait",
            "--poll-interval",
            "10",
            "--timeout-seconds",
            "0.25",
        ],
    )
    assert result.exit_code == 1
    assert "Timed out" in json.loads(result.stdout)["error"]
    assert [call[0] for call in client.calls] == ["POST"]
    assert client.closed


def test_wait_rejects_a_non_finite_timeout(runner, cli_config_dir, monkeypatch):
    _install(monkeypatch, FakeTranscriptionsClient())
    result = runner.invoke(
        app,
        [
            "--json",
            "transcriptions",
            "retry",
            "job-1",
            "--wait",
            "--timeout-seconds",
            "inf",
        ],
    )
    assert result.exit_code == 1, result.output
    assert json.loads(result.output)["error"].startswith("--timeout-seconds")


@pytest.mark.parametrize("terminal", ["failed", "interrupted", "invalidated"])
def test_wait_reports_every_terminal_state_honestly(
    runner, cli_config_dir, monkeypatch, terminal
):
    _install(monkeypatch, FakeTranscriptionsClient(states=[terminal]))
    result = runner.invoke(
        app,
        [
            "--json",
            "transcriptions",
            "retry",
            "job-1",
            "--wait",
            "--poll-interval",
            "0.01",
            "--timeout-seconds",
            "5",
        ],
    )
    assert result.exit_code == 1, result.output
    payload = json.loads(result.output)
    assert terminal in payload["error"]


def test_start_surfaces_executor_unavailable(runner, cli_config_dir, monkeypatch):
    client = _install(
        monkeypatch,
        FakeTranscriptionsClient(
            fail_post=APIError(
                message="HTTP 503: Transcription executor is unavailable",
                status_code=503,
            )
        ),
    )
    result = runner.invoke(
        app,
        [
            "--json",
            "transcriptions",
            "start",
            "rd-1",
            "media-1",
            "--speech-configuration-revision",
            "rev-7",
        ],
    )
    assert result.exit_code == 1, result.output
    payload = json.loads(result.output)
    assert payload["status_code"] == 503
    assert "unavailable" in payload["error"]
    assert client.closed is True


def test_client_is_closed_on_wait(runner, cli_config_dir, monkeypatch):
    client = _install(monkeypatch, FakeTranscriptionsClient(states=["complete"]))
    runner.invoke(
        app,
        [
            "--json",
            "transcriptions",
            "start",
            "rd-1",
            "media-1",
            "--speech-configuration-revision",
            "rev-7",
            "--wait",
            "--poll-interval",
            "0.01",
        ],
    )
    assert client.closed is True
