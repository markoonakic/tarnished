from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from tarnished_cli.auth_storage import StoredAuth
from tarnished_cli.models.auth import AuthDiagnostics, LiveAuthIdentity

API_KEY_PREFIX_LENGTH = 8


def parse_live_identity(payload: object) -> LiveAuthIdentity:
    return LiveAuthIdentity.model_validate(payload)


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


def _coerce_live_identity(
    live_identity: LiveAuthIdentity | Mapping[str, Any] | None,
) -> LiveAuthIdentity | None:
    if live_identity is None:
        return None
    if isinstance(live_identity, LiveAuthIdentity):
        return live_identity
    return parse_live_identity(live_identity)
