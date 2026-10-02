from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Literal
from urllib.parse import unquote

import httpx
from tzlocal import get_localzone_name

AuthMode = Literal["none", "api_key"]


def redact_credentials(text: str, api_key: str | None = None) -> str:
    if api_key:
        text = text.replace(api_key, "[redacted]")
    return re.sub(r"(\w+://)[^\s/]*@", r"\1[redacted]@", text)


def _resolve_cli_version() -> str:
    try:
        return version("tarnished-cli")
    except PackageNotFoundError:
        return "0.0.0"


CLI_VERSION = _resolve_cli_version()

DATE_SENSITIVE_ROUTE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("GET", re.compile(r"^/api/streak$")),
    ("GET", re.compile(r"^/api/dashboard/kpis$")),
    ("GET", re.compile(r"^/api/dashboard/needs-attention$")),
    ("GET", re.compile(r"^/api/analytics/kpis$")),
    ("GET", re.compile(r"^/api/analytics/weekly$")),
    ("GET", re.compile(r"^/api/analytics/heatmap$")),
    ("GET", re.compile(r"^/api/analytics/interview-rounds$")),
    ("GET", re.compile(r"^/api/analytics/feedback$")),
    ("POST", re.compile(r"^/api/analytics/feedback$")),
    ("POST", re.compile(r"^/api/analytics/insights$")),
    ("POST", re.compile(r"^/api/applications$")),
    ("POST", re.compile(r"^/api/applications/extract$")),
    ("PATCH", re.compile(r"^/api/applications/[^/]+$")),
    ("POST", re.compile(r"^/api/job-leads/[^/]+/convert$")),
    ("POST", re.compile(r"^/api/applications/[^/]+/rounds$")),
    ("PATCH", re.compile(r"^/api/rounds/[^/]+$")),
    ("POST", re.compile(r"^/api/rounds/[^/]+/media$")),
    ("POST", re.compile(r"^/api/rounds/[^/]+/transcript$")),
)


@lru_cache(maxsize=1)
def _resolve_local_time_zone() -> str | None:
    tz_env = os.getenv("TZ")
    if tz_env:
        return tz_env

    try:
        return get_localzone_name()
    except Exception:
        return None


def _should_include_time_zone(method: str, path: str) -> bool:
    return any(
        allowed_method == method and pattern.match(path)
        for allowed_method, pattern in DATE_SENSITIVE_ROUTE_PATTERNS
    )


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
        api_key: str | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        try:
            self._origin_url = httpx.URL(self.base_url)
        except httpx.InvalidURL:
            raise CLIError(
                "Invalid server URL. Configure the final server URL."
            ) from None
        self._client = httpx.Client(
            base_url=self.base_url,
            follow_redirects=True,
            timeout=30.0,
            transport=transport,
            event_hooks={"request": [self._check_request_origin]},
            headers={
                "Accept": "application/json",
                "User-Agent": f"tarnished-cli/{CLI_VERSION}",
                "X-Client-Version": CLI_VERSION,
            },
        )

    def _check_request_origin(self, request: httpx.Request) -> None:
        # HTTPX strips Authorization, but NOT custom X-API-Key, on redirects.
        # Request hooks run before transport on every hop (including uploads).
        url = request.url
        origin = self._origin_url
        if (
            url.userinfo
            or origin.userinfo
            or (self.api_key and self.api_key in unquote(str(url)))
            or url.scheme not in {"http", "https"}
            or (url.scheme, url.host, url.port)
            != (origin.scheme, origin.host, origin.port)
        ):
            raise CLIError(
                "Cross-origin and credential-bearing URLs/redirects are unsupported. "
                "Configure the final server URL instead."
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
        files: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        auth: AuthMode = "api_key",
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        request_headers = self._build_request_headers(method, path, auth)
        if headers:
            request_headers.update(headers)
        try:
            response = self._client.request(
                method,
                path,
                params=params,
                json=json_body,
                files=files,
                data=data,
                headers=request_headers,
                timeout=timeout,
            )
        except httpx.TimeoutException:
            raise CLIError("Server request timed out.") from None
        except httpx.TooManyRedirects:
            raise CLIError(
                "Too many redirects. Configure the final server URL."
            ) from None
        except (httpx.HTTPError, httpx.StreamError, httpx.InvalidURL):
            # Exception text may contain credentials, URLs, or response content.
            raise CLIError(
                "Server connection or response transfer failed. "
                "Check the server URL, network and TLS configuration."
            ) from None

        if response.is_redirect:
            raise CLIError(
                "Unsupported or incomplete redirect. Configure the final server URL."
            )
        if response.is_error:
            raise self._to_api_error(response)

        return response

    def get_json(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        auth: AuthMode = "api_key",
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> Any:
        return self._decode_response(
            self.request(
                "GET", path, params=params, auth=auth, timeout=timeout, headers=headers
            )
        )

    def post_json(
        self,
        path: str,
        *,
        body: dict[str, Any] | None,
        auth: AuthMode = "api_key",
        headers: dict[str, str] | None = None,
    ) -> Any:
        return self._decode_response(
            self.request("POST", path, json_body=body, auth=auth, headers=headers)
        )

    def patch_json(
        self,
        path: str,
        *,
        body: dict[str, Any],
        auth: AuthMode = "api_key",
        headers: dict[str, str] | None = None,
    ) -> Any:
        return self._decode_response(
            self.request("PATCH", path, json_body=body, auth=auth, headers=headers)
        )

    def put_json(
        self,
        path: str,
        *,
        body: dict[str, Any],
        auth: AuthMode = "api_key",
        headers: dict[str, str] | None = None,
    ) -> Any:
        return self._decode_response(
            self.request("PUT", path, json_body=body, auth=auth, headers=headers)
        )

    def delete(self, path: str, *, auth: AuthMode = "api_key") -> None:
        self.request("DELETE", path, auth=auth)

    def delete_json(self, path: str, *, auth: AuthMode = "api_key") -> Any:
        return self._decode_response(self.request("DELETE", path, auth=auth))

    def post_file_json(
        self,
        path: str,
        *,
        file_path: Path,
        field_name: str = "file",
        data: dict[str, Any] | None = None,
        auth: AuthMode = "api_key",
        content_type: str | None = None,
    ) -> Any:
        with file_path.open("rb") as handle:
            file_tuple: tuple[str, Any] | tuple[str, Any, str]
            if content_type is None:
                file_tuple = (file_path.name, handle)
            else:
                file_tuple = (file_path.name, handle, content_type)
            response = self.request(
                "POST",
                path,
                files={field_name: file_tuple},
                data=data,
                auth=auth,
            )

        return self._decode_response(response)

    def get_bytes(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        auth: AuthMode = "api_key",
    ) -> tuple[bytes, httpx.Headers]:
        response = self.request("GET", path, params=params, auth=auth)
        return response.content, response.headers

    def _build_request_headers(
        self,
        method: str,
        path: str,
        auth: AuthMode,
    ) -> dict[str, str]:
        headers: dict[str, str] = {}

        if auth != "none":
            if not self.api_key:
                raise CLIError("This command requires an API key.")
            headers["X-API-Key"] = self.api_key

        if _should_include_time_zone(method, path):
            time_zone = _resolve_local_time_zone()
            if time_zone:
                headers["Time-Zone"] = time_zone

        return headers

    def _decode_response(self, response: httpx.Response) -> Any:
        if response.status_code == 204 or not response.content:
            return None
        try:
            return response.json()
        except (ValueError, UnicodeError):
            raise CLIError("Server returned an invalid JSON response.") from None

    def _redact_error_payload(self, payload: Any) -> Any:
        if isinstance(payload, str):
            return redact_credentials(payload, self.api_key)
        if isinstance(payload, list):
            return [self._redact_error_payload(value) for value in payload]
        if isinstance(payload, dict):
            return {
                redact_credentials(key, self.api_key): self._redact_error_payload(value)
                for key, value in payload.items()
            }
        return payload

    def _to_api_error(self, response: httpx.Response) -> APIError:
        try:
            payload = response.json()
        except (ValueError, UnicodeError):
            payload = response.text or None

        # Preserve structured API details without echoing the configured key or
        # credentials embedded in URLs, including nested values and object keys.
        payload = self._redact_error_payload(payload)
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
