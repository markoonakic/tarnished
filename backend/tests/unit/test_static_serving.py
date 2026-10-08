"""Exercise production route registration, not an isolated path calculation."""

import runpy
from pathlib import Path

import httpx
import pytest


@pytest.fixture
async def static_client(tmp_path, monkeypatch):
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("SPA shell")
    (static / "favicon.ico").write_text("icon")
    (static / "assets" / "app.js").write_text("javascript")
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "secret.txt").write_text("UPLOAD SECRET")
    (tmp_path / "config.txt").write_text("CONFIG SECRET")
    (static / "leak").symlink_to(tmp_path / "uploads", target_is_directory=True)
    (static / "assets" / "leak.txt").symlink_to(tmp_path / "config.txt")
    source = Path(__file__).resolve().parents[2] / "app" / "main.py"
    monkeypatch.chdir(tmp_path)
    app = runpy.run_path(str(source))["app"]
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


@pytest.mark.parametrize(
    "path",
    [
        "/%2e%2e/config.txt",
        "/..%2fconfig.txt",
        "/%2e%2e%2fuploads/secret.txt",
        "/%2f..%2fconfig.txt",
        "/%252e%252e%252fconfig.txt",
        "/leak/secret.txt",
        "/assets/leak.txt",
        "/assets/%2e%2e/%2e%2e/config.txt",
        "/%2e%2e%5cconfig.txt",
    ],
)
async def test_static_paths_cannot_escape(static_client, path):
    response = await static_client.get(path)
    assert response.status_code in (200, 404)
    assert "SECRET" not in response.text


@pytest.mark.parametrize(
    ("path", "code", "body"),
    [
        ("/", 200, "SPA shell"),
        ("/applications/123", 200, "SPA shell"),
        ("/favicon.ico", 200, "icon"),
        ("/assets/app.js", 200, "javascript"),
        ("/assets/missing.js", 404, None),
        ("/api", 404, None),
        ("/api/not-a-route", 404, None),
        ("/api/rounds/missing", 401, None),
        ("/health", 200, '{"status":"healthy"}'),
    ],
)
async def test_static_navigation_and_assets(static_client, path, code, body):
    response = await static_client.get(path)
    assert response.status_code == code
    if body is not None:
        assert response.text == body
    if path.startswith("/api"):
        assert response.headers["content-type"].startswith("application/json")


async def test_static_absolute_decoded_path_cannot_escape(static_client, tmp_path):
    absolute = str(tmp_path / "config.txt").replace("/", "%2f")
    response = await static_client.get("/" + absolute)
    assert response.status_code in (200, 404)
    assert "SECRET" not in response.text


async def test_static_fallback_symlink_cannot_escape(static_client, tmp_path):
    index = tmp_path / "static" / "index.html"
    index.unlink()
    index.symlink_to(tmp_path / "config.txt")
    response = await static_client.get("/applications/123")
    assert response.status_code == 404
    assert "SECRET" not in response.text


async def test_static_assets_directory_symlink_cannot_escape(static_client, tmp_path):
    assets = tmp_path / "static" / "assets"
    (assets / "app.js").unlink()
    (assets / "leak.txt").unlink()
    assets.rmdir()
    assets.symlink_to(tmp_path / "uploads", target_is_directory=True)
    response = await static_client.get("/assets/secret.txt")
    assert response.status_code == 404
    assert "SECRET" not in response.text
