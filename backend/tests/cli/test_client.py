import httpx

from app.cli.client import TarnishedClient


def test_client_refreshes_and_retries_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/auth/me":
            auth_header = request.headers.get("Authorization")
            if auth_header == "Bearer old-a":
                return httpx.Response(401, json={"detail": "expired"})
            if auth_header == "Bearer new-a":
                return httpx.Response(
                    200,
                    json={
                        "id": "u1",
                        "email": "cli@example.com",
                        "is_admin": False,
                        "is_active": True,
                    },
                )

        if request.url.path == "/api/auth/refresh":
            return httpx.Response(
                200,
                json={"access_token": "new-a", "refresh_token": "new-r"},
            )

        return httpx.Response(500, json={"detail": "unexpected request"})

    client = TarnishedClient(
        base_url="https://example.test",
        access_token="old-a",
        refresh_token="old-r",
        transport=httpx.MockTransport(handler),
    )

    payload = client.get_json("/api/auth/me")

    assert payload["email"] == "cli@example.com"
    assert client.access_token == "new-a"


def test_client_uses_api_key_when_requested():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-API-Key"] == "api-key-123"
        return httpx.Response(200, json={"sources": ["LinkedIn"]})

    client = TarnishedClient(
        base_url="https://example.test",
        api_key="api-key-123",
        transport=httpx.MockTransport(handler),
    )

    payload = client.get_json("/api/job-leads/sources", auth="api_key")

    assert payload["sources"] == ["LinkedIn"]
