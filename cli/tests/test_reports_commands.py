"""Report-scope CLI coverage: request/inspect and honest read-only behaviour."""

import json

import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeReportsClient:
    def __init__(self):
        self.calls = []

    def close(self):
        return None

    def get_json(
        self, path, *, params=None, auth="api_key", timeout=30.0, headers=None
    ):
        self.calls.append(("GET", path, params))
        if path == "/api/rounds/rd-1/interview-feedback":
            return {
                "scope": "INTERVIEW",
                "round_id": "rd-1",
                "report": {"scope": "INTERVIEW", "findings": []},
                "stale_reason": None,
            }
        if path == "/api/applications/app-1/feedback":
            return {"scope": "APPLICATION", "report": None, "stale_reason": None}
        if path == "/api/analytics/feedback":
            assert params is not None
            return {
                "scope": "PIPELINE",
                "period": params["period"],
                "time_zone": "UTC",
                "report": None,
                "stale_reason": "no report yet; request one explicitly",
            }
        raise AssertionError(f"Unexpected GET path: {path}")

    def post_json(self, path, *, body, auth="api_key", headers=None):
        self.calls.append(("POST", path, body))
        return {"id": "job-1", "state": "queued", "scope": path}


def _install(monkeypatch):
    client = FakeReportsClient()
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: client,
    )
    return client


def test_reading_reports_never_posts(runner, cli_config_dir, monkeypatch):
    client = _install(monkeypatch)
    for args in (
        ["--json", "reports", "interview", "get", "rd-1"],
        ["--json", "reports", "application", "get", "app-1"],
        ["--json", "reports", "pipeline", "get", "--period", "30d"],
    ):
        result = runner.invoke(app, args)
        assert result.exit_code == 0, result.output
    assert [call[0] for call in client.calls] == ["GET", "GET", "GET"]


def test_pipeline_get_forwards_period_and_as_of(runner, cli_config_dir, monkeypatch):
    client = _install(monkeypatch)
    result = runner.invoke(
        app,
        [
            "--json",
            "reports",
            "pipeline",
            "get",
            "--period",
            "3m",
            "--as-of",
            "2026-01-15T00:00:00+00:00",
        ],
    )
    assert result.exit_code == 0, result.output
    assert client.calls[0][2] == {
        "period": "3m",
        "as_of": "2026-01-15T00:00:00+00:00",
    }
    payload = json.loads(result.output)
    assert payload["scope"] == "PIPELINE"


def test_requesting_a_report_posts_the_body(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    client = _install(monkeypatch)
    body = tmp_path / "intent.json"
    body.write_text(
        json.dumps(
            {
                "intent_id": "11111111-1111-1111-1111-111111111111",
                "generation": 3,
                "config_revision": "rev-9",
            }
        )
    )
    result = runner.invoke(
        app,
        [
            "--json",
            "reports",
            "application",
            "request",
            "app-1",
            "--body-file",
            str(body),
        ],
    )
    assert result.exit_code == 0, result.output
    method, path, sent = client.calls[0]
    assert (method, path) == ("POST", "/api/applications/app-1/feedback")
    assert sent == {
        "intent_id": "11111111-1111-1111-1111-111111111111",
        "generation": 3,
        "config_revision": "rev-9",
    }


def test_pipeline_request_accepts_period_selection(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    client = _install(monkeypatch)
    body = tmp_path / "intent.json"
    body.write_text(
        json.dumps(
            {
                "intent_id": "22222222-2222-2222-2222-222222222222",
                "config_revision": "rev-9",
                "period": "all",
            }
        )
    )
    result = runner.invoke(
        app,
        ["--json", "reports", "pipeline", "request", "--body-file", str(body)],
    )
    assert result.exit_code == 0, result.output
    assert client.calls[0][2]["period"] == "all"


def test_report_request_rejects_unknown_fields(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    _install(monkeypatch)
    body = tmp_path / "intent.json"
    body.write_text(
        json.dumps(
            {
                "intent_id": "33333333-3333-3333-3333-333333333333",
                "config_revision": "rev-9",
                "period": "30d",
                "unexpected": True,
            }
        )
    )
    result = runner.invoke(
        app,
        ["--json", "reports", "pipeline", "request", "--body-file", str(body)],
    )
    assert result.exit_code != 0


def test_report_http_failure_is_parseable_json(runner, cli_config_dir, monkeypatch):
    class FailingClient:
        def get_json(self, path, *, params=None, auth="api_key"):
            from tarnished_cli.client import APIError

            raise APIError(message="HTTP 403: Forbidden", status_code=403)

    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FailingClient(),
    )
    result = runner.invoke(app, ["--json", "reports", "interview", "get", "rd-1"])
    assert result.exit_code == 1
    payload = json.loads(result.output)
    assert payload["status_code"] == 403
    assert "403" in payload["error"]
