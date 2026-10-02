"""Curated host-local speech route; never downloads or loads models on inspection."""

import asyncio
import json
from ipaddress import ip_address
from urllib.parse import urlsplit

import httpx

# The curated local selection. Tiny is the fast default; Base is an optional
# larger snapshot for better accuracy. Nothing outside this set is accepted.
CURATED_MODELS = {
    "Systran/faster-whisper-tiny.en": {
        "snapshot_bytes": 78093394,
        "label": "Tiny English",
        "note": "Small and fastest; lowest accuracy of the pair.",
    },
    "Systran/faster-whisper-base.en": {
        "snapshot_bytes": 147772310,
        "label": "Base English",
        "note": "Optional larger snapshot; better accuracy, roughly 30% slower on CPU.",
    },
}
LOCAL_MODEL = "Systran/faster-whisper-tiny.en"
LOCAL_MODELS = tuple(CURATED_MODELS)


def is_local_endpoint(value: str) -> bool:
    """Only the bundled service name, loopback, or private literal addresses.

    This is configuration validation, not proof of operator-controlled DNS/egress.
    """
    try:
        endpoint = urlsplit(value)
        if (
            endpoint.scheme != "http"
            or endpoint.path.rstrip("/") != "/v1"
            or endpoint.username
            or endpoint.password
            or endpoint.query
            or endpoint.fragment
        ):
            return False
        _ = endpoint.port
        if endpoint.hostname in {"speaches", "localhost"}:
            return True
        address = ip_address(endpoint.hostname or "")
        return (
            (address.is_private or address.is_loopback)
            and not address.is_unspecified
            and not address.is_multicast
            and not address.is_link_local
            and (not address.is_reserved or address.is_loopback)
        )
    except ValueError:
        return False


async def inspect_local_speech(endpoint: str) -> dict:
    """Read cache listing only; a model card is NOT successful model inference."""
    if not is_local_endpoint(endpoint):
        return {
            "status": "unavailable",
            "message": "A private local endpoint is required.",
            "installed": [],
        }
    try:
        async with (
            asyncio.timeout(8),
            httpx.AsyncClient(
                trust_env=False,
                follow_redirects=False,
                timeout=httpx.Timeout(5, connect=3),
                transport=httpx.AsyncHTTPTransport(retries=0),
            ) as client,
            client.stream(
                "GET",
                endpoint.rstrip("/") + "/models",
                headers={"Accept-Encoding": "identity"},
            ) as response,
        ):
            if response.status_code != 200:
                return {
                    "status": "unavailable",
                    "message": "Local service unavailable. Run the operator setup and check the private service.",
                    "installed": [],
                }
            if response.headers.get("content-encoding", "identity") != "identity":
                raise ValueError
            body = bytearray()
            async for block in response.aiter_bytes():
                body.extend(block)
                if len(body) > 65536:
                    raise ValueError
        data = json.loads(body)["data"]
        if not isinstance(data, list) or any(
            not isinstance(item, dict) for item in data
        ):
            raise ValueError
        listed = {item.get("id") for item in data}
        installed = [model for model in LOCAL_MODELS if model in listed]
        if installed:
            return {
                "status": "installed_unvalidated",
                "message": "Model listed in cache; integrity, loading and inference are not verified by this check. Start transcription explicitly; loading/inference progress and errors appear on the job.",
                "installed": installed,
            }
        return {
            "status": "not_installed",
            "message": "No curated model is listed. Run the explicit operator setup; selecting a model never downloads it.",
            "installed": [],
        }
    except (httpx.HTTPError, TimeoutError):
        return {
            "status": "unavailable",
            "message": "Cannot reach the local service. Check operator setup and private networking.",
            "installed": [],
        }
    except (ValueError, KeyError, TypeError):
        return {
            "status": "error",
            "message": "Local service returned an unsupported cache listing. No inference or download was requested.",
            "installed": [],
        }
