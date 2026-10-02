"""Transcript read/paste/edit and document-text CLI coverage."""

import json

import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeClient:
    def __init__(self):
        self.calls = []

    def get_json(self, path, *, params=None, auth="api_key"):
        self.calls.append(("GET", path, params, None))
        if path == "/api/rounds/rd-1/transcript":
            return {
                "generation": 2,
                "transcript": {
                    "id": "t-1",
                    "revision": 1,
                    "coverage": "complete_audio",
                    "segments": [{"id": "s-1", "text": "Hello", "speaker": None}],
                },
                "attachment_only": False,
            }
        if path == "/api/applications/app-1/documents/cv/text":
            return {"text": "Existing CV", "revision": 4, "message": "current"}
        raise AssertionError(f"Unexpected GET path: {path}")

    def put_json(self, path, *, body, auth="api_key", headers=None):
        self.calls.append(("PUT", path, body, headers))
        return {"generation": 3, "transcript": None, "attachment_only": False}

    def patch_json(self, path, *, body, auth="api_key", headers=None):
        self.calls.append(("PATCH", path, body, headers))
        return {"generation": 3, "transcript": None, "attachment_only": False}


def _install(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: client,
    )
    return client


def test_transcript_get_returns_json(runner, cli_config_dir, monkeypatch):
    _install(monkeypatch)
    result = runner.invoke(app, ["--json", "rounds", "transcript", "get", "rd-1"])
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["generation"] == 2


def test_transcript_paste_sends_generation_header(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    client = _install(monkeypatch)
    body = tmp_path / "transcript.json"
    body.write_text(json.dumps({"text": "one two", "format": "txt"}))
    result = runner.invoke(
        app,
        [
            "--json",
            "rounds",
            "transcript",
            "paste",
            "rd-1",
            "--body-file",
            str(body),
            "--expected-generation",
            "2",
        ],
    )
    assert result.exit_code == 0, result.output
    method, path, sent, headers = client.calls[0]
    assert (method, path) == ("PUT", "/api/rounds/rd-1/transcript")
    assert sent == {"text": "one two", "format": "txt"}
    assert headers == {"expected-transcript-generation": "2"}


def test_transcript_edit_sends_generation_header(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    client = _install(monkeypatch)
    body = tmp_path / "edit.json"
    body.write_text(json.dumps({"segments": [{"id": "s-1", "text": "Corrected"}]}))
    result = runner.invoke(
        app,
        [
            "--json",
            "rounds",
            "transcript",
            "edit",
            "rd-1",
            "--body-file",
            str(body),
            "--expected-generation",
            "2",
        ],
    )
    assert result.exit_code == 0, result.output
    method, _, sent, headers = client.calls[0]
    assert method == "PATCH"
    assert sent["segments"][0]["id"] == "s-1"
    assert headers == {"expected-transcript-generation": "2"}


def test_transcript_generation_is_required(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    _install(monkeypatch)
    body = tmp_path / "transcript.json"
    body.write_text(json.dumps({"text": "one two", "format": "txt"}))
    result = runner.invoke(
        app,
        ["rounds", "transcript", "paste", "rd-1", "--body-file", str(body)],
    )
    assert result.exit_code != 0


def test_document_text_read(runner, cli_config_dir, monkeypatch):
    _install(monkeypatch)
    result = runner.invoke(app, ["--json", "applications", "cv", "text", "app-1"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["revision"] == 4


def test_document_text_paste_sends_revision(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    client = _install(monkeypatch)
    body = tmp_path / "cv.json"
    body.write_text(json.dumps({"text": "New CV text", "expected_revision": 4}))
    result = runner.invoke(
        app,
        [
            "--json",
            "applications",
            "cv",
            "paste-text",
            "app-1",
            "--body-file",
            str(body),
        ],
    )
    assert result.exit_code == 0, result.output
    method, path, sent, _ = client.calls[0]
    assert method == "PUT"
    assert path == "/api/applications/app-1/documents/cv/text"
    assert sent == {"text": "New CV text", "expected_revision": 4}


def test_cover_letter_text_reads_its_own_endpoint(runner, cli_config_dir, monkeypatch):
    client = _install(monkeypatch)
    seen = {}

    def get_json(path, *, params=None, auth="api_key"):
        seen["path"] = path
        return {"text": "Cover letter text", "revision": 1, "message": "current"}

    client.get_json = get_json
    result = runner.invoke(
        app, ["--json", "applications", "cover-letter", "text", "app-1"]
    )
    assert result.exit_code == 0, result.output
    assert seen["path"] == "/api/applications/app-1/documents/cover_letter/text"
    assert json.loads(result.output)["text"] == "Cover letter text"
