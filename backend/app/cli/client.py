from __future__ import annotations

import json
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from typing import Any, Callable, Literal

import httpx

AuthMode = Literal["none", "jwt", "api_key", "flexible"]
TokenUpdateHook = Callable[[str, str], None]


def _resolve_cli_version() -> str:
    try:
        return version("tarnished-backend")
    except PackageNotFoundError:
        return "0.0.0"


CLI_VERSION = _resolve_cli_version()


@dataclass(slots=True)
class CLIError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True)
class APIError(CLIError):
    status_code: int
    payload: Any | None = None


class TarnishedClient:
    def __init__(
        self,
        *,
        base_url: str,
        access_token: str | None = None,
        refresh_token: str | None = None,
        api_key: str | None = None,
        on_token_refresh: TokenUpdateHook | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.api_key = api_key
        self._on_token_refresh = on_token_refresh
        self._client = httpx.Client(
            base_url=self.base_url,
            follow_redirects=True,
            timeout=30.0,
            transport=transport,
            headers={
                "Accept": "application/json",
                "User-Agent": f"tarnished-cli/{CLI_VERSION}",
                "X-Client-Version": CLI_VERSION,
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> TarnishedClient:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        auth: AuthMode = "jwt",
        allow_refresh: bool = True,
    ) -> httpx.Response:
        response = self._client.request(
            method,
            path,
            params=params,
            json=json_body,
            headers=self._build_auth_headers(auth),
        )

        if (
            response.status_code == 401
            and allow_refresh
            and auth in {"jwt", "flexible"}
            and self.access_token
            and self.refresh_token
        ):
            self.refresh_session()
            return self.request(
                method,
                path,
                params=params,
                json_body=json_body,
                auth=auth,
                allow_refresh=False,
            )

        if response.is_error:
            raise self._to_api_error(response)

        return response

    def get_json(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        auth: AuthMode = "jwt",
    ) -> Any:
        return self._decode_response(
            self.request("GET", path, params=params, auth=auth)
        )

    def post_json(
        self,
        path: str,
        *,
        body: dict[str, Any],
        auth: AuthMode = "jwt",
    ) -> Any:
        return self._decode_response(
            self.request("POST", path, json_body=body, auth=auth)
        )

    def patch_json(
        self,
        path: str,
        *,
        body: dict[str, Any],
        auth: AuthMode = "jwt",
    ) -> Any:
        return self._decode_response(
            self.request("PATCH", path, json_body=body, auth=auth)
        )

    def put_json(
        self,
        path: str,
        *,
        body: dict[str, Any],
        auth: AuthMode = "jwt",
    ) -> Any:
        return self._decode_response(
            self.request("PUT", path, json_body=body, auth=auth)
        )

    def delete(self, path: str, *, auth: AuthMode = "jwt") -> None:
        self.request("DELETE", path, auth=auth)

    def refresh_session(self) -> None:
        if not self.refresh_token:
            raise CLIError("This command requires login.")

        response = self._client.post(
            "/api/auth/refresh",
            json={"refresh_token": self.refresh_token},
        )
        if response.is_error:
            raise CLIError("Stored session expired. Run `tarnished auth login` again.")

        payload = response.json()
        access_token = payload.get("access_token")
        refresh_token = payload.get("refresh_token")
        if not access_token or not refresh_token:
            raise CLIError("Refresh response did not include a full token pair.")

        self.access_token = access_token
        self.refresh_token = refresh_token
        if self._on_token_refresh is not None:
            self._on_token_refresh(access_token, refresh_token)

    def _build_auth_headers(self, auth: AuthMode) -> dict[str, str]:
        headers: dict[str, str] = {}

        if auth == "none":
            return headers

        if auth == "jwt":
            if not self.access_token:
                raise CLIError("This command requires login. Run `tarnished auth login`.")
            headers["Authorization"] = f"Bearer {self.access_token}"
            return headers

        if auth == "api_key":
            if not self.api_key:
                raise CLIError("This command requires an API key.")
            headers["X-API-Key"] = self.api_key
            return headers

        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
            return headers

        if self.api_key:
            headers["X-API-Key"] = self.api_key
            return headers

        raise CLIError("This command requires authentication.")

    def _decode_response(self, response: httpx.Response) -> Any:
        if response.status_code == 204 or not response.content:
            return None
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            return response.json()
        return response.text

    def _to_api_error(self, response: httpx.Response) -> APIError:
        try:
            payload = response.json()
        except json.JSONDecodeError:
            payload = response.text or None

        detail = payload
        if isinstance(payload, dict) and "detail" in payload:
            detail = payload["detail"]

        if isinstance(detail, str):
            message = detail
        elif isinstance(detail, dict):
            message = (
                detail.get("message")
                or detail.get("detail")
                or json.dumps(detail, sort_keys=True)
            )
        else:
            message = str(detail or response.reason_phrase)

        return APIError(
            message=f"HTTP {response.status_code}: {message}",
            status_code=response.status_code,
            payload=payload,
        )
