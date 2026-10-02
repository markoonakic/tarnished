import json

import httpx
import pytest

import tarnished_cli.client as client_module
from tarnished_cli.main import app


@pytest.mark.parametrize("zone", ["Asia/Tokyo", "America/Los_Angeles"])
@pytest.mark.parametrize("explicit", [False, True])
def test_application_create_dates_and_timezone(
    runner, mock_server, monkeypatch, tmp_path, zone, explicit
):
    monkeypatch.setattr(client_module, "_resolve_local_time_zone", lambda: zone)
    body = {"company": "Acme", "job_title": "Engineer", "status_id": "s-1"}
    if explicit:
        body["applied_at"] = "2024-02-29"
    path = tmp_path / "create.json"
    path.write_text(json.dumps(body))
    requests = []

    def handler(request):
        requests.append(request)
        assert request.headers["Time-Zone"] == zone
        assert json.loads(request.content) == body
        return httpx.Response(201, json={"id": "app-1"})

    mock_server(handler)
    result = runner.invoke(
        app, ["--json", "applications", "create", "--body-file", str(path)]
    )
    assert result.exit_code == 0, result.output
    assert len(requests) == 1


@pytest.mark.parametrize(
    "instant", ["2026-11-01T01:30:00", "2026-11-01T01:30:00-05:00"]
)
def test_round_dates_keep_wall_or_explicit_offset(
    runner, mock_server, monkeypatch, tmp_path, instant
):
    monkeypatch.setattr(
        client_module, "_resolve_local_time_zone", lambda: "America/New_York"
    )
    path = tmp_path / "round.json"
    path.write_text(json.dumps({"scheduled_at": instant, "completed_at": None}))
    requests = []

    def handler(request):
        requests.append(request)
        assert request.headers["Time-Zone"] == "America/New_York"
        assert json.loads(request.content) == {
            "scheduled_at": instant,
            "completed_at": None,
        }
        return httpx.Response(200, json={"id": "round-1"})

    mock_server(handler)
    result = runner.invoke(
        app, ["--json", "rounds", "update", "round-1", "--body-file", str(path)]
    )
    assert result.exit_code == 0, result.output
    assert len(requests) == 1
