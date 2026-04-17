from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Literal

import httpx
from tzlocal import get_localzone_name

AuthMode = Literal["none", "api_key"]


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
        files: dict[str, Any] | None = None,
        auth: AuthMode = "api_key",
    ) -> httpx.Response:
        response = self._client.request(
            method,
            path,
            params=params,
            json=json_body,
            files=files,
            headers=self._build_request_headers(method, path, auth),
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
    ) -> Any:
        return self._decode_response(
            self.request("GET", path, params=params, auth=auth)
        )

    def post_json(
        self,
        path: str,
        *,
        body: dict[str, Any],
        auth: AuthMode = "api_key",
    ) -> Any:
        return self._decode_response(
            self.request("POST", path, json_body=body, auth=auth)
        )

    def patch_json(
        self,
        path: str,
        *,
        body: dict[str, Any],
        auth: AuthMode = "api_key",
    ) -> Any:
        return self._decode_response(
            self.request("PATCH", path, json_body=body, auth=auth)
        )

    def put_json(
        self,
        path: str,
        *,
        body: dict[str, Any],
        auth: AuthMode = "api_key",
    ) -> Any:
        return self._decode_response(
            self.request("PUT", path, json_body=body, auth=auth)
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
            response = self._client.request(
                "POST",
                path,
                files={field_name: file_tuple},
                data=data,
                headers=self._build_request_headers("POST", path, auth),
            )

        if response.is_error:
            raise self._to_api_error(response)

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
