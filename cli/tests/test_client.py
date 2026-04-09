from pathlib import Path

import httpx

from tarnished_cli.client import TarnishedClient


def test_client_uses_api_key_by_default():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-API-Key"] == "api-key-123"
        return httpx.Response(200, json={"sources": ["LinkedIn"]})

    client = TarnishedClient(
        base_url="https://example.test",
        api_key="api-key-123",
        transport=httpx.MockTransport(handler),
    )

    payload = client.get_json("/api/job-leads/sources")

    assert payload["sources"] == ["LinkedIn"]


def test_client_allows_unauthenticated_requests_when_explicit():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "X-API-Key" not in request.headers
        return httpx.Response(200, json={"ok": True})

    client = TarnishedClient(
        base_url="https://example.test",
        transport=httpx.MockTransport(handler),
    )

    payload = client.get_json("/health", auth="none")

    assert payload["ok"] is True


def test_client_uploads_file_and_decodes_json(tmp_path: Path):
    uploaded = tmp_path / "resume.pdf"
    uploaded.write_bytes(b"%PDF-1.4 fake")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/api/applications/app-123/cv"
        assert request.headers["X-API-Key"] == "api-key-123"
        return httpx.Response(
            200, json={"id": "app-123", "cv_path": "uploads/hash.pdf"}
        )

    client = TarnishedClient(
        base_url="https://example.test",
        api_key="api-key-123",
        transport=httpx.MockTransport(handler),
    )

    payload = client.post_file_json(
        "/api/applications/app-123/cv",
        file_path=uploaded,
    )

    assert payload["id"] == "app-123"


def test_client_downloads_bytes():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/files/media/media-123"
        assert request.headers["X-API-Key"] == "api-key-123"
        return httpx.Response(
            200,
            content=b"audio-bytes",
            headers={"Content-Type": "audio/mpeg"},
        )

    client = TarnishedClient(
        base_url="https://example.test",
        api_key="api-key-123",
        transport=httpx.MockTransport(handler),
    )

    content, headers = client.get_bytes("/api/files/media/media-123")

    assert content == b"audio-bytes"
    assert headers["Content-Type"] == "audio/mpeg"
