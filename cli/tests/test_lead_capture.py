import json
import re
import shlex
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from tarnished_cli.main import app
from tarnished_cli.models.requests import (
    JobLeadCreate,
    JobLeadExtractRequest,
    JobLeadUpdate,
)


@pytest.mark.parametrize("command", ["save", "create"])
def test_save_is_one_local_only_post_with_saved_identity(
    runner, mock_server, tmp_path, command
):
    body = {"url": "https://synthetic.test/job", "text": "<script>untrusted</script>"}
    file = tmp_path / "capture.json"
    file.write_text(json.dumps(body))
    calls = []

    def handler(request):
        calls.append(request)
        assert request.method == "POST" and request.url.path == "/api/job-leads"
        assert json.loads(request.content) == body
        return httpx.Response(
            201,
            json={
                "id": "saved-id",
                "status": "pending",
                "revision": 0,
                "content_warning": "No AI configured",
                "source_truncated": False,
            },
        )

    mock_server(handler)
    result = runner.invoke(
        app, ["--json", "job-leads", command, "--body-file", str(file)]
    )
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["id"] == "saved-id"
    assert len(calls) == 1


def test_edit_preserves_omission_null_empty_list_and_revision(
    runner, mock_server, tmp_path
):
    body = {"expected_revision": 4, "company": "Manual", "location": None, "skills": []}
    file = tmp_path / "edit.json"
    file.write_text(json.dumps(body))

    def handler(request):
        assert (
            request.method == "PATCH" and request.url.path == "/api/job-leads/saved-id"
        )
        assert json.loads(request.content) == body
        return httpx.Response(200, json={"id": "saved-id", "revision": 5, **body})

    mock_server(handler)
    result = runner.invoke(
        app, ["--json", "job-leads", "edit", "saved-id", "--body-file", str(file)]
    )
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["id"] == "saved-id"


@pytest.mark.parametrize("command", ["extract", "retry"])
@pytest.mark.parametrize("restart", [False, True])
def test_explicit_extraction_body_without_hidden_reads_or_retries(
    runner, mock_server, command, restart
):
    calls = []

    def handler(request):
        calls.append(request)
        assert (
            request.method == "POST"
            and request.url.path == f"/api/job-leads/saved-id/{command}"
        )
        assert json.loads(request.content) == {
            "expected_revision": 5,
            "restart_processing": restart,
        }
        return httpx.Response(
            200, json={"id": "saved-id", "revision": 7, "status": "extracted"}
        )

    mock_server(handler)
    args = ["--json", "job-leads", command, "saved-id", "--expected-revision", "5"]
    if restart:
        args.append("--restart-processing")
    result = runner.invoke(app, args)
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["revision"] == 7
    assert len(calls) == 1


@pytest.mark.parametrize("failure", [409, 502, 504, "timeout"])
def test_failed_enrichment_retains_known_identity_and_stable_error_envelope(
    runner, mock_server, failure
):
    calls = []

    def handler(request):
        calls.append(request)
        if failure == "timeout":
            raise httpx.ReadTimeout("synthetic timeout", request=request)
        return httpx.Response(
            failure,
            json={
                "detail": {
                    "id": "saved-id",
                    "message": "Job lead changed"
                    if failure == 409
                    else "Extraction failed; lead saved",
                }
            },
        )

    mock_server(handler)
    result = runner.invoke(
        app, ["--json", "job-leads", "extract", "saved-id", "--expected-revision", "5"]
    )
    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["id"] == "saved-id"
    assert "Inspect with job-leads get before retrying" in payload["error"]
    if failure != "timeout":
        assert payload["status_code"] == failure
        assert payload["details"]["detail"]["id"] == "saved-id"
    assert len(calls) == 1


def test_duplicate_save_preserves_existing_identity(runner, mock_server, tmp_path):
    file = tmp_path / "save.json"
    file.write_text(json.dumps({"url": "https://synthetic.test/job"}))
    mock_server(
        lambda request: httpx.Response(
            409, json={"detail": {"id": "existing-id", "message": "Already saved"}}
        )
    )
    result = runner.invoke(
        app, ["--json", "job-leads", "save", "--body-file", str(file)]
    )
    assert result.exit_code == 1
    assert json.loads(result.stdout)["details"]["detail"]["id"] == "existing-id"


def test_convert_does_not_read_or_extract_and_keeps_timezone(runner, mock_server):
    calls = []

    def handler(request):
        calls.append(request)
        assert (
            request.method == "POST"
            and request.url.path == "/api/job-leads/saved-id/convert"
        )
        assert json.loads(request.content) == {}
        assert request.headers["Time-Zone"]
        return httpx.Response(
            201, json={"id": "application-id", "job_lead_id": "saved-id"}
        )

    mock_server(handler)
    result = runner.invoke(app, ["--json", "job-leads", "convert", "saved-id"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["id"] == "application-id"
    assert len(calls) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"expected_revision": 0},
        {"company": "Manual"},
        {"expected_revision": -1, "company": "Manual"},
        {"expected_revision": 0, "user_id": "foreign"},
        {"expected_revision": 0, "source_text": "changed"},
        {"expected_revision": 0, "status": "converted"},
        {"expected_revision": 0, "skills": None},
        {"expected_revision": 0, "salary_min": 10, "salary_max": 1},
        {"expected_revision": 0, "years_experience_min": -1},
        {"expected_revision": 0, "title": "a" * 256},
        {"expected_revision": 0, "title": "a\x00b"},
        {"expected_revision": 0, "skills": ["a"] * 201},
        {"expected_revision": 0, "skills": ["a" * 2001]},
    ],
)
def test_typed_edit_rejects_invalid_or_internal_fields(body):
    with pytest.raises(ValidationError):
        JobLeadUpdate.model_validate(body)


def test_typed_bodies_match_character_bounds_and_partial_semantics():
    assert JobLeadCreate.model_validate(
        {"url": "https://synthetic.test/job", "text": "😀" * 100_000}
    ).text
    with pytest.raises(ValidationError):
        JobLeadCreate.model_validate(
            {"url": "https://synthetic.test/job", "text": "😀" * 100_001}
        )
    body = {"expected_revision": 0, "salary_max": 1, "company": None, "skills": []}
    assert (
        JobLeadUpdate.model_validate(body).model_dump(mode="json", exclude_unset=True)
        == body
    )
    assert JobLeadExtractRequest(expected_revision=0).restart_processing is False


def test_documented_capture_journey_commands_execute(
    runner, mock_server, tmp_path, monkeypatch
):
    guide = (
        Path(__file__).parents[2] / "documentation/content/how-to/use-the-cli.md"
    ).read_text()
    section = guide.split("## Capture job leads without AI")[1].split(
        "## Preferences and time zone settings"
    )[0]
    bodies = [json.loads(value) for value in re.findall(r"`(\{[^`]+\})`", section)]
    (tmp_path / "capture.json").write_text(json.dumps(bodies[0]))
    (tmp_path / "corrections.json").write_text(json.dumps(bodies[1]))
    monkeypatch.chdir(tmp_path)
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path))
        return httpx.Response(200, json={"id": "saved-id", "revision": 0})

    mock_server(handler)
    examples = [
        line
        for block in re.findall(r"```bash\n(.*?)```", section, re.S)
        for line in block.splitlines()
        if line.startswith("tarnished ")
    ]
    assert len(examples) == 6
    for example in examples:
        result = runner.invoke(
            app, shlex.split(example.replace("$LEAD_ID", "saved-id"))[1:]
        )
        assert result.exit_code == 0, (example, result.output)
        json.loads(result.stdout)
    assert calls == [
        ("POST", "/api/job-leads"),
        ("GET", "/api/job-leads/saved-id"),
        ("PATCH", "/api/job-leads/saved-id"),
        ("POST", "/api/job-leads/saved-id/extract"),
        ("POST", "/api/job-leads/saved-id/retry"),
        ("POST", "/api/job-leads/saved-id/convert"),
    ]


@pytest.mark.parametrize("command", ["extract", "retry"])
def test_revision_is_required_before_transport(runner, mock_server, command):
    mock_server(lambda request: pytest.fail("No request allowed without revision"))
    result = runner.invoke(app, ["job-leads", command, "saved-id"])
    assert result.exit_code != 0
    assert "expected-revision" in re.sub(r"\x1b\[[0-9;]*m", "", result.output)
