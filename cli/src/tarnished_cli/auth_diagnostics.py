from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from pydantic import ValidationError

from tarnished_cli.auth_storage import StoredAuth
from tarnished_cli.client import CLIError
from tarnished_cli.models.auth import AuthDiagnostics, LiveAuthIdentity

API_KEY_PREFIX_LENGTH = 8
# Mirrors the backend CLI preset scope list in backend/app/core/api_key_scopes.py.
CLI_REQUIRED_SCOPES = (
    "applications:read",
    "applications:write",
    "job_leads:read",
    "job_leads:write",
    "profile:read",
    "profile:write",
    "rounds:read",
    "rounds:write",
    "statuses:read",
    "statuses:write",
    "round_types:read",
    "round_types:write",
    "dashboard:read",
    "analytics:read",
    "streak:read",
    "streak:write",
    "preferences:read",
    "preferences:write",
    "user_settings:read",
    "user_settings:write",
    "files:read",
    "files:write",
    "export:read",
    "import:write",
)


def parse_live_identity(payload: object) -> LiveAuthIdentity:
    try:
        return LiveAuthIdentity.model_validate(payload)
    except ValidationError as exc:
        first_error = exc.errors()[0] if exc.errors() else None
        detail = first_error["msg"] if first_error is not None else str(exc)
        raise CLIError(f"Unexpected /api/auth/whoami response: {detail}") from exc


def stored_api_key_prefix(api_key: str | None) -> str | None:
    if not api_key:
        return None
    return api_key[:API_KEY_PREFIX_LENGTH]


def build_auth_diagnostics(
    *,
    profile: str,
    base_url: str,
    stored_auth: StoredAuth,
    live_identity: LiveAuthIdentity | Mapping[str, Any] | None = None,
) -> AuthDiagnostics:
    return AuthDiagnostics(
        profile=profile,
        base_url=base_url,
        has_stored_api_key=bool(stored_auth.api_key),
        stored_api_key_prefix=stored_api_key_prefix(stored_auth.api_key),
        live_identity=_coerce_live_identity(live_identity),
    )


def missing_cli_scopes(
    live_identity: LiveAuthIdentity | Mapping[str, Any] | None,
    *,
    required_scopes: Sequence[str] = CLI_REQUIRED_SCOPES,
) -> list[str]:
    identity = _coerce_live_identity(live_identity)
    if identity is None or identity.api_key is None:
        return list(required_scopes)

    granted_scopes = set(identity.api_key.scopes)
    return [scope for scope in required_scopes if scope not in granted_scopes]


def build_auth_doctor_report(
    *,
    profile: str,
    base_url: str,
    stored_auth: StoredAuth,
    live_identity: LiveAuthIdentity | Mapping[str, Any] | None = None,
    live_identity_error: str | None = None,
    required_scopes: Sequence[str] = CLI_REQUIRED_SCOPES,
) -> dict[str, Any]:
    diagnostics = build_auth_diagnostics(
        profile=profile,
        base_url=base_url,
        stored_auth=stored_auth,
        live_identity=live_identity,
    )
    report: dict[str, Any] = diagnostics.model_dump(mode="json")
    report["required_cli_scopes"] = list(required_scopes)

    checks: list[dict[str, str]] = []

    if not diagnostics.has_stored_api_key:
        checks.append(
            _build_check(
                name="stored_api_key",
                status="fail",
                message=(
                    "No stored API key configured. Create a CLI preset key in the "
                    "Tarnished web app, then run tarnished auth init --api-key '...'."
                ),
            )
        )
        checks.append(
            _build_check(
                name="api_key_authentication",
                status="skip",
                message="Skipped live auth check because no stored API key is configured.",
            )
        )
        checks.append(
            _build_check(
                name="cli_scopes",
                status="skip",
                message="Skipped CLI scope check because no stored API key is configured.",
            )
        )
        report["checks"] = checks
        report["missing_cli_scopes"] = list(required_scopes)
        report["healthy"] = False
        return report

    checks.append(
        _build_check(
            name="stored_api_key",
            status="pass",
            message=(
                "Stored API key found"
                + (
                    f" (prefix {diagnostics.stored_api_key_prefix})."
                    if diagnostics.stored_api_key_prefix
                    else "."
                )
            ),
        )
    )

    if live_identity_error is not None:
        checks.append(
            _build_check(
                name="api_key_authentication",
                status="fail",
                message=f"Live API key validation failed: {live_identity_error}",
            )
        )
        checks.append(
            _build_check(
                name="cli_scopes",
                status="skip",
                message="Skipped CLI scope check because live API key validation failed.",
            )
        )
        report["checks"] = checks
        report["missing_cli_scopes"] = list(required_scopes)
        report["healthy"] = False
        return report

    if diagnostics.live_identity is None:
        checks.append(
            _build_check(
                name="api_key_authentication",
                status="fail",
                message="Live API key validation did not return a whoami payload.",
            )
        )
        checks.append(
            _build_check(
                name="cli_scopes",
                status="skip",
                message="Skipped CLI scope check because live API key validation failed.",
            )
        )
        report["checks"] = checks
        report["missing_cli_scopes"] = list(required_scopes)
        report["healthy"] = False
        return report

    if (
        diagnostics.live_identity.auth_method != "api_key"
        or diagnostics.live_identity.api_key is None
    ):
        checks.append(
            _build_check(
                name="api_key_authentication",
                status="fail",
                message=(
                    "Expected /api/auth/whoami to confirm API key auth and return API "
                    "key metadata."
                ),
            )
        )
        checks.append(
            _build_check(
                name="cli_scopes",
                status="skip",
                message="Skipped CLI scope check because live API key validation failed.",
            )
        )
        report["checks"] = checks
        report["missing_cli_scopes"] = list(required_scopes)
        report["healthy"] = False
        return report

    checks.append(
        _build_check(
            name="api_key_authentication",
            status="pass",
            message=f"Authenticated as {diagnostics.live_identity.email}.",
        )
    )

    missing_scopes = missing_cli_scopes(
        diagnostics.live_identity,
        required_scopes=required_scopes,
    )
    if missing_scopes:
        checks.append(
            _build_check(
                name="cli_scopes",
                status="fail",
                message=(
                    "API key is missing required CLI scopes: "
                    f"{', '.join(missing_scopes)}. Create or rotate a key in the "
                    "Tarnished web app with the CLI preset."
                ),
            )
        )
    else:
        checks.append(
            _build_check(
                name="cli_scopes",
                status="pass",
                message="API key includes all required CLI scopes.",
            )
        )

    report["checks"] = checks
    report["missing_cli_scopes"] = missing_scopes
    report["healthy"] = all(check["status"] == "pass" for check in checks)
    return report


def _build_check(*, name: str, status: str, message: str) -> dict[str, str]:
    return {"name": name, "status": status, "message": message}


def _coerce_live_identity(
    live_identity: LiveAuthIdentity | Mapping[str, Any] | None,
) -> LiveAuthIdentity | None:
    if live_identity is None:
        return None
    if isinstance(live_identity, LiveAuthIdentity):
        return live_identity
    return parse_live_identity(live_identity)
