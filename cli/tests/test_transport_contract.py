"""Exercise the shared HTTPX boundary through both client and real CLI entrypoints."""

import json
import logging
import ssl

import httpx
import pytest

from tarnished_cli.client import APIError, CLIError, TarnishedClient
from tarnished_cli.main import app

KEY = "test-only-api-key"
BASE = "https://api.example.test"


class BrokenStream(httpx.SyncByteStream):
    def __iter__(self):
        yield b"partial"
        raise httpx.ReadError(f"interrupted {KEY} https://user:password@bad.test")


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError,
        httpx.ConnectTimeout,
        httpx.ReadTimeout,
        httpx.WriteTimeout,
        httpx.PoolTimeout,
        httpx.RemoteProtocolError,
        httpx.LocalProtocolError,
        httpx.UnsupportedProtocol,
        httpx.TooManyRedirects,
        httpx.ReadError,
        httpx.WriteError,
        httpx.DecodingError,
        httpx.StreamConsumed,
        "tls",
        "stream",
        "json",
    ],
)
@pytest.mark.parametrize("command", ["profile", "doctor", "download", "upload"])
def test_transport_failures_have_cli_exit_and_safe_json(
    failure, command, mock_server, runner, tmp_path, caplog
):
    calls = []
    target = tmp_path / "existing.bin"
    target.write_bytes(b"keep me")

    def handler(request):
        calls.append(request)
        if failure == "stream":
            return httpx.Response(200, stream=BrokenStream())
        if failure == "json":
            # A binary download does not claim to parse JSON.
            return httpx.Response(
                200, content=b"{", headers={"content-type": "application/json"}
            )
        if failure == "tls":
            raise httpx.ConnectError(f"TLS {KEY}") from ssl.SSLError(
                "certificate failed"
            )
        if failure is httpx.StreamConsumed:
            raise httpx.StreamConsumed()
        raise failure(f"unsafe {KEY} https://user:password@bad.test")

    mock_server(handler)
    commands = {
        "profile": ["profile", "get"],
        "doctor": ["auth", "doctor"],
        "download": ["export", "zip", "--output", str(target)],
        "upload": ["import", "validate", "--file", str(target)],
    }
    with caplog.at_level(logging.INFO):
        result = runner.invoke(app, ["--json", *commands[command]])
    if failure == "json" and command == "download":
        assert result.exit_code == 0
        assert target.read_bytes() == b"{"
    else:
        assert result.exit_code == 1
        payload = json.loads(result.stdout)
        assert payload.get("error") or payload.get("healthy") is False
        assert target.read_bytes() == b"keep me"
    assert result.stderr == ""
    assert KEY not in result.output + caplog.text
    assert "password" not in result.output + caplog.text
    assert len(calls) == 1  # Never retry writes or reads implicitly.


@pytest.mark.parametrize("mode", ["json", "bytes", "upload"])
@pytest.mark.parametrize(
    "location",
    [
        "https://other.test/final",
        "http://api.example.test/final",
        "https://api.example.test:444/final",
        "https://api.example.test@other.test/final",
        "//other.test/final",
        "https://user:password@api.example.test/final",
        "ftp://api.example.test/final",
    ],
)
def test_redirect_never_sends_second_origin_request(mode, location, tmp_path):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(307, headers={"location": location})

    archive = tmp_path / "archive.zip"
    archive.write_bytes(b"archive")
    with (
        TarnishedClient(
            base_url=BASE, api_key=KEY, transport=httpx.MockTransport(handler)
        ) as client,
        pytest.raises(CLIError, match="final server URL") as exc,
    ):
        if mode == "json":
            client.post_json("/start", body={"write": True})
        elif mode == "bytes":
            client.get_bytes("/start")
        else:
            client.post_file_json("/start", file_path=archive)
    assert len(seen) == 1
    assert seen[0].headers["X-API-Key"] == KEY
    assert "password" not in str(exc.value)


@pytest.mark.parametrize("location", ["/final", BASE + ":443/final"])
@pytest.mark.parametrize("mode", ["json", "bytes", "upload"])
def test_same_origin_redirect_preserves_307_contract(mode, location, tmp_path):
    seen = []

    def handler(request):
        seen.append(request)
        if len(seen) == 1:
            return httpx.Response(307, headers={"location": location})
        assert request.headers["X-API-Key"] == KEY
        assert request.url.path == "/final"
        return httpx.Response(200, json={"ok": True})

    archive = tmp_path / "archive.zip"
    archive.write_bytes(b"archive")
    with TarnishedClient(
        base_url=BASE, api_key=KEY, transport=httpx.MockTransport(handler)
    ) as client:
        if mode == "json":
            assert client.post_json("/start", body={"write": True}) == {"ok": True}
        elif mode == "bytes":
            content, _ = client.get_bytes("/start")
            assert json.loads(content) == {"ok": True}
        else:
            assert client.post_file_json("/start", file_path=archive) == {"ok": True}
    assert len(seen) == 2
    assert seen[0].method == seen[1].method
    assert seen[0].content == seen[1].content


def test_actual_httpx_0281_forwards_custom_key_without_our_guard():
    seen = []

    def handler(request):
        seen.append(request)
        if len(seen) == 1:
            return httpx.Response(302, headers={"location": "https://other.test/final"})
        return httpx.Response(200)

    assert httpx.__version__ == "0.28.1"
    with httpx.Client(
        transport=httpx.MockTransport(handler), follow_redirects=True
    ) as client:
        client.get(BASE, headers={"X-API-Key": KEY, "Authorization": "Bearer fake"})
    assert seen[1].headers["X-API-Key"] == KEY
    assert "Authorization" not in seen[1].headers


@pytest.mark.parametrize("content", [b"{", b"\xff", b"", b'"error"'])
def test_malformed_error_body_is_safe(content, mock_server, runner):
    mock_server(
        lambda request: httpx.Response(
            500, content=content, headers={"content-type": "application/json"}
        )
    )
    result = runner.invoke(app, ["--json", "profile", "get"])
    assert result.exit_code == 1
    assert json.loads(result.stdout)["status_code"] == 500
    assert result.stderr == ""


def test_error_payload_redacts_echoed_credentials(mock_server, runner):
    mock_server(
        lambda request: httpx.Response(
            400,
            json={
                "detail": {"message": KEY, "url": "https://user:password@host.test"},
                "nested": [KEY],
            },
        )
    )
    result = runner.invoke(app, ["--json", "profile", "get"])
    assert result.exit_code == 1
    assert json.loads(result.stdout)["status_code"] == 400
    assert KEY not in result.output
    assert "password" not in result.output


@pytest.mark.parametrize("code", [200, 204])
def test_empty_success_contract(code, mock_server, runner):
    mock_server(lambda request: httpx.Response(code))
    result = runner.invoke(app, ["--json", "profile", "get"])
    assert result.exit_code == 0
    assert json.loads(result.stdout) is None
    assert result.stderr == ""


def test_redirect_loop_is_bounded(mock_server, runner):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(307, headers={"location": "/loop"})

    mock_server(handler)
    result = runner.invoke(app, ["--json", "profile", "get"])
    assert result.exit_code == 1
    assert "redirect" in json.loads(result.stdout)["error"].lower()
    assert len(seen) <= 21


def test_text_network_error_uses_stderr(mock_server, runner, monkeypatch):
    monkeypatch.setenv("TARNISHED_OUTPUT", "text")

    def handler(request):
        raise httpx.ConnectError("refused")

    mock_server(handler)
    result = runner.invoke(app, ["profile", "get"])
    assert result.exit_code == 1
    assert result.stdout == ""
    assert "connect" in result.stderr.lower()


@pytest.mark.parametrize(
    "path",
    [
        "https://other.test/path",
        "https://api.example.test@other.test/path",
        "https://user:password@api.example.test/path",
    ],
)
def test_direct_absolute_paths_cannot_bypass_origin_hook(path):
    seen = []
    with (
        TarnishedClient(
            base_url=BASE,
            api_key=KEY,
            transport=httpx.MockTransport(
                lambda request: seen.append(request) or httpx.Response(200)
            ),
        ) as client,
        pytest.raises(CLIError, match="final server URL"),
    ):
        client.get_bytes(path)
    assert seen == []


@pytest.mark.parametrize(
    "command", [["auth", "status"], ["auth", "doctor"], ["profile", "get"]]
)
def test_configured_url_credentials_are_not_sent_or_printed(
    command, mock_server, runner, caplog
):
    seen = []
    mock_server(lambda request: seen.append(request) or httpx.Response(200))
    with caplog.at_level(logging.INFO):
        result = runner.invoke(
            app,
            [
                "--base-url",
                "https://user:password@api.example.test",
                "--json",
                *command,
            ],
        )
    assert result.exit_code == (0 if command == ["auth", "status"] else 1)
    assert "password" not in result.output + caplog.text
    assert seen == []
    json.loads(result.stdout)


@pytest.mark.parametrize("key", ['fake-quote-"-key', "fake-backslash-\\-key"])
def test_error_redaction_handles_json_escaped_keys(key):
    with (
        TarnishedClient(
            base_url=BASE,
            api_key=key,
            transport=httpx.MockTransport(
                lambda request: httpx.Response(400, json={"detail": key, key: [key]})
            ),
        ) as client,
        pytest.raises(APIError) as exc,
    ):
        client.get_json("/api/profile")
    assert key not in str(exc.value)
    assert key not in str(exc.value.payload)


@pytest.mark.parametrize(
    "body,content_type",
    [
        (b"<html>proxy error</html>", "text/html"),
        (b"\xff", "application/json"),
        (b"{", "application/problem+json"),
    ],
)
def test_expected_json_rejects_malformed_body(body, content_type, mock_server, runner):
    mock_server(
        lambda request: httpx.Response(
            200, content=body, headers={"content-type": content_type}
        )
    )
    result = runner.invoke(app, ["--json", "profile", "get"])
    assert result.exit_code == 1
    assert "JSON" in json.loads(result.stdout)["error"]
    assert result.stderr == ""


@pytest.mark.parametrize("code", [300, 301, 302, 303, 304, 307, 308])
def test_unresolved_redirect_is_not_a_successful_download(
    code, mock_server, runner, tmp_path
):
    target = tmp_path / "existing.bin"
    target.write_bytes(b"keep")
    mock_server(lambda request: httpx.Response(code, content=b"not a file"))
    result = runner.invoke(app, ["--json", "export", "zip", "--output", str(target)])
    assert result.exit_code == 1
    assert "final server URL" in json.loads(result.stdout)["error"]
    assert target.read_bytes() == b"keep"


def test_same_origin_redirect_cannot_put_key_in_httpx_logs(mock_server, runner, caplog):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(307, headers={"location": "/final?echo=" + KEY})

    mock_server(handler)
    with caplog.at_level(logging.INFO):
        result = runner.invoke(app, ["--json", "profile", "get"])
    assert result.exit_code == 1
    assert KEY not in result.output + caplog.text
    assert len(seen) == 1


def test_doctor_does_not_print_entire_short_key(mock_server, runner, monkeypatch):
    monkeypatch.setenv("TARNISHED_API_KEY", "tinykey")

    def handler(request):
        raise httpx.ConnectError("offline")

    mock_server(handler)
    result = runner.invoke(app, ["--json", "auth", "doctor"])
    assert result.exit_code == 1
    assert json.loads(result.stdout)["stored_api_key_prefix"] is None
    assert "tinykey" not in result.output
