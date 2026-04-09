import tarnished_cli.state as state_module
from tarnished_cli.main import app


class FakeRoundsClient:
    def post_json(self, path, *, body, auth="api_key"):
        if path == "/api/applications/app-123/rounds":
            assert auth == "api_key"
            assert body["round_type_id"] == "rt-1"
            return {
                "id": "round-1",
                "round_type": {"id": "rt-1", "name": "Phone Screen"},
            }
        raise AssertionError(f"Unexpected POST path: {path}")

    def patch_json(self, path, *, body, auth="api_key"):
        assert path == "/api/rounds/round-1"
        assert auth == "api_key"
        return {"id": "round-1", "notes_summary": body["notes_summary"]}

    def delete(self, path, *, auth="api_key"):
        assert auth == "api_key"
        assert path in {
            "/api/rounds/round-1",
            "/api/media/media-1",
            "/api/rounds/round-1/transcript",
        }

    def post_file_json(
        self,
        path,
        *,
        file_path,
        field_name="file",
        auth="api_key",
        content_type=None,
        allow_refresh=True,
    ):
        assert auth == "api_key"
        assert file_path.exists()
        if path == "/api/rounds/round-1/media":
            return {"id": "round-1", "media": [{"id": "media-1"}]}
        if path == "/api/rounds/round-1/transcript":
            return {"id": "round-1", "transcript_path": "uploads/transcript.pdf"}
        raise AssertionError(f"Unexpected file POST path: {path}")

    def get_json(self, path, *, params=None, auth="api_key"):
        if path == "/api/files/media/media-1/signed":
            return {"url": "/signed/media", "expires_in": 300}
        if path == "/api/files/rounds/round-1/transcript/signed":
            return {"url": "/signed/transcript", "expires_in": 300}
        raise AssertionError(f"Unexpected GET path: {path}")

    def get_bytes(self, path, *, params=None, auth="api_key"):
        if path == "/api/files/media/media-1":
            return (b"media-bytes", {"Content-Type": "audio/mpeg"})
        if path == "/api/files/rounds/round-1/transcript":
            return (b"transcript-bytes", {"Content-Type": "application/pdf"})
        raise AssertionError(f"Unexpected download path: {path}")


def test_rounds_create_posts_validated_body(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeRoundsClient(),
    )
    body_file = tmp_path / "round.json"
    body_file.write_text('{"round_type_id":"rt-1","notes_summary":"Intro call"}')

    result = runner.invoke(
        app,
        ["rounds", "create", "app-123", "--body-file", str(body_file)],
    )

    assert result.exit_code == 0
    assert '"id": "round-1"' in result.stdout


def test_rounds_delete_requires_yes(runner, cli_config_dir):
    result = runner.invoke(app, ["rounds", "delete", "round-1"])

    assert result.exit_code != 0
    combined = result.output + result.stderr
    assert "rounds delete" in combined.lower()


def test_rounds_media_upload_posts_file(runner, cli_config_dir, monkeypatch, tmp_path):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeRoundsClient(),
    )
    media_file = tmp_path / "audio.mp3"
    media_file.write_bytes(b"mp3")

    result = runner.invoke(
        app,
        ["rounds", "media", "upload", "round-1", "--file", str(media_file)],
    )

    assert result.exit_code == 0
    assert '"media"' in result.stdout


def test_rounds_transcript_download_writes_file(
    runner, cli_config_dir, monkeypatch, tmp_path
):
    monkeypatch.setattr(
        state_module.AppState,
        "build_client",
        lambda self, auth_required=True, transport=None: FakeRoundsClient(),
    )
    output = tmp_path / "transcript.pdf"

    result = runner.invoke(
        app,
        ["rounds", "transcript", "download", "round-1", "--output", str(output)],
    )

    assert result.exit_code == 0
    assert output.read_bytes() == b"transcript-bytes"
