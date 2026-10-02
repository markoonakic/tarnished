import json
import os
import stat
from pathlib import Path

import httpx
import pytest

from tarnished_cli.main import app

COMMANDS = [
    ["export", "zip"],
    ["export", "csv"],
    ["export", "json"],
    ["applications", "cv", "download", "app-1"],
    ["applications", "cover-letter", "download", "app-1"],
    ["rounds", "media", "download", "media-1"],
    ["rounds", "transcript", "download", "round-1"],
]


@pytest.mark.parametrize("command", COMMANDS)
@pytest.mark.parametrize(
    "failure",
    [None, "read", "http", "redirect", "write", "chmod", "replace", "interrupt"],
)
def test_all_download_commands_preserve_destination_on_failure(
    command, failure, runner, mock_server, tmp_path, monkeypatch
):
    destination = tmp_path / "existing.bin"
    original = b"existing bytes must survive"
    destination.write_bytes(original)
    content = b"\x00\xff\x01binary\n"
    seen = []

    class Stream(httpx.SyncByteStream):
        def __iter__(self):
            yield content[:3]
            if failure == "read":
                raise httpx.ReadError("interrupted transfer")
            yield content[3:]

    def handler(request):
        seen.append(request)
        if failure == "http":
            return httpx.Response(403, json={"detail": "Insufficient scope"})
        if failure == "redirect":
            return httpx.Response(307, headers={"location": "https://other.test/file"})
        return httpx.Response(200, stream=Stream())

    mock_server(handler)
    write_bytes = Path.write_bytes

    def fail_write(path, data):
        write_bytes(path, b"partial disk write")
        if failure == "interrupt":
            raise KeyboardInterrupt
        raise OSError("disk full")

    def fail_chmod(path, mode):
        raise OSError("cannot set private permissions")

    def fail_replace(path, target):
        raise OSError("cannot replace")

    if failure in {"write", "interrupt"}:
        monkeypatch.setattr(Path, "write_bytes", fail_write)
    if failure == "chmod":
        monkeypatch.setattr(Path, "chmod", fail_chmod)
    if failure == "replace":
        monkeypatch.setattr(Path, "replace", fail_replace)

    result = runner.invoke(app, ["--json", *command, "--output", str(destination)])
    assert len(seen) == 1
    assert not list(tmp_path.glob(".tarnished-*"))
    if failure:
        assert result.exit_code == (130 if failure == "interrupt" else 1)
        assert destination.read_bytes() == original
        assert "output_path" not in result.stdout
        if failure != "interrupt":
            assert json.loads(result.stdout)["error"]
            assert result.stderr == ""
    else:
        assert result.exit_code == 0
        assert destination.read_bytes() == content
        assert json.loads(result.stdout) == {
            "output_path": str(destination),
            "bytes": len(content),
        }
        assert result.stderr == ""


@pytest.mark.skipif(os.name != "posix", reason="POSIX destination permissions")
@pytest.mark.parametrize("command", COMMANDS)
def test_download_commands_do_not_broaden_private_destination_permissions(
    command, runner, mock_server, tmp_path
):
    destination = tmp_path / "private.bin"
    destination.write_bytes(b"old private bytes")
    destination.chmod(0o600)
    content = b"\x00\xffnew private bytes\n"
    mock_server(lambda request: httpx.Response(200, content=content))

    previous_umask = os.umask(0o022)
    try:
        result = runner.invoke(app, ["--json", *command, "--output", str(destination)])
    finally:
        os.umask(previous_umask)

    assert result.exit_code == 0
    assert result.stderr == ""
    assert destination.read_bytes() == content
    assert json.loads(result.stdout) == {
        "output_path": str(destination),
        "bytes": len(content),
    }
    assert stat.S_IMODE(destination.stat().st_mode) == 0o600
    assert not list(tmp_path.glob(".tarnished-*"))
