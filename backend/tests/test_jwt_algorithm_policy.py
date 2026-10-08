"""Every token reader pins its configured algorithm, including signed links."""

from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

from app.core import security


@pytest.mark.parametrize(
    ("reader", "token_type"),
    [
        (security.decode_token, "access"),
        (security.decode_file_token, "file"),
        (security.decode_media_token, "media"),
        (security.decode_round_transcript_token, "round_transcript"),
    ],
)
def test_der_public_key_cannot_change_the_configured_algorithm(
    monkeypatch, reader, token_type
):
    # CVE-2026-85394: an attacker can sign HMAC with a known DER public key.
    public_key = (
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        .public_key()
        .public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
    )
    claims = {
        "sub": "owner",
        "session_version": 0,
        "type": token_type,
        "exp": 4102444800,
    }
    forged = jwt.encode(claims, public_key, algorithm="HS256")
    assert jwt.decode(forged, public_key, algorithms=["HS256"]) == claims
    monkeypatch.setattr(
        security, "settings", SimpleNamespace(secret_key=public_key, algorithm="RS256")
    )
    assert reader(forged) is None
