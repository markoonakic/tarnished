"""Offline proof through installed LiteLLM and OpenAI, not mocked completion."""

import json
import logging
import socket
from unittest.mock import Mock

import httpx
import pytest
from litellm.llms.vertex_ai.vertex_llm_base import VertexBase

from app.core.logging_config import setup_logging
from app.core.security import create_access_token
from app.models import ApplicationStatus, User
from app.services import extraction, insights
from app.services.ai_settings import (
    AISettingsState,
    CapabilityUnavailableError,
    get_ai_settings,
)


@pytest.fixture
def offline_adapter(monkeypatch):
    # Synthetic environment only; never let an adapter discover local credentials
    # or use DNS/network, even if the expected dispatch guard regresses.
    monkeypatch.setenv("OPENAI_API_KEY", "ambient-key-canary")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://ambient-endpoint-canary.invalid/v1")
    monkeypatch.setenv("VERTEXAI_PROJECT", "synthetic-project-canary")
    monkeypatch.setenv("VERTEXAI_LOCATION", "us-central1")
    monkeypatch.setenv(
        "GOOGLE_APPLICATION_CREDENTIALS", "/nonexistent/credential-canary"
    )
    auth = Mock(side_effect=RuntimeError("offline credential resolution blocked"))
    monkeypatch.setattr(VertexBase, "_credentials_from_default_auth", auth)
    network = Mock(side_effect=RuntimeError("offline network blocked"))
    monkeypatch.setattr(socket.socket, "connect", network)
    monkeypatch.setattr(socket, "create_connection", network)
    monkeypatch.setattr(socket, "getaddrinfo", network)
    requests = []

    def transport(_self, request):
        requests.append(request)
        raise httpx.ConnectError("offline transport blocked", request=request)

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", transport)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", network)
    yield requests, auth, network
    network.assert_not_called()


@pytest.mark.parametrize(
    "model", ["vertex_ai/gemini-2.0-flash", "gemini/gemini-2.0-flash", "gpt-4o-mini"]
)
def test_unsupported_keyless_never_reaches_ambient_auth(model, offline_adapter):
    requests, auth, _ = offline_adapter
    state = AISettingsState(model, None, "http://127.0.0.1:4000/v1", keyless=True)
    with pytest.raises(CapabilityUnavailableError, match="unsupported"):
        insights.generate_insights_from_settings(state, {}, {}, {}, "30d")
    assert state.configuration_status == "unsupported"
    assert not state.disclosure().available
    auth.assert_not_called()
    assert requests == []


@pytest.mark.parametrize(
    "model", ["openai/gpt-4o-mini", "openai/synthetic-local-model"]
)
def test_keyless_openai_adapter_uses_explicit_endpoint_and_sentinel(
    model, offline_adapter
):
    requests, auth, _ = offline_adapter
    state = AISettingsState(model, None, "http://127.0.0.1:4000/v1", keyless=True)
    assert state.is_configured
    with pytest.raises(extraction.ExtractionInvalidResponseError):
        extraction.extract_with_llm(
            "Synthetic job",
            "https://jobs.invalid/one",
            model=state.effective_model,
            api_key=state.dispatch_api_key,
            api_base=state.base_url,
            retry_invalid_response=False,
        )
    assert len(requests) == 1
    assert str(requests[0].url) == "http://127.0.0.1:4000/v1/chat/completions"
    assert requests[0].headers["authorization"] == "Bearer tarnished-keyless"
    assert "ambient-" not in str(requests[0].headers)
    auth.assert_not_called()


@pytest.mark.parametrize("inherited_level", [logging.NOTSET, logging.DEBUG])
def test_real_litellm_wrapper_does_not_log_endpoint_secrets(
    inherited_level, offline_adapter, caplog
):
    requests, auth, _ = offline_adapter
    root = logging.getLogger()
    old_handlers, old_level = root.handlers[:], root.level
    names = (
        "LiteLLM",
        "LiteLLM Router",
        "LiteLLM Proxy",
        "httpx",
        "httpcore",
        "openai",
        "aiosqlite",
        "sqlalchemy.engine",
        "uvicorn.access",
    )
    levels = {name: logging.getLogger(name).level for name in names}
    try:
        for name in ("LiteLLM", "LiteLLM Router", "LiteLLM Proxy"):
            logging.getLogger(name).setLevel(inherited_level)
        setup_logging("DEBUG")
        root.addHandler(caplog.handler)
        with pytest.raises(extraction.ExtractionInvalidResponseError) as exc:
            extraction.extract_with_llm(
                "Synthetic job",
                "https://jobs.invalid/one",
                model="openai/gpt-4o-mini",
                api_key="tarnished-keyless",
                api_base="http://127.0.0.1:4000/private-path-canary?token=query-canary",
                retry_invalid_response=False,
            )
        assert requests, (
            "Must traverse the installed wrapper, SDK and transport boundary"
        )
        auth.assert_not_called()
        assert "canary" not in str(exc.value)
        assert "private-path-canary" not in caplog.text
        assert "query-canary" not in caplog.text
    finally:
        root.handlers = old_handlers
        root.setLevel(old_level)
        for name, level in levels.items():
            logging.getLogger(name).setLevel(level)


def test_unchecked_vertex_route_reaches_blocked_ambient_resolver(offline_adapter):
    """Negative control: the old sentinel alone did not prevent ambient auth."""
    requests, auth, _ = offline_adapter
    with pytest.raises(Exception):
        insights.completion(
            model="vertex_ai/gemini-2.0-flash",
            messages=[{"role": "user", "content": "Synthetic input"}],
            api_key="tarnished-keyless",
            api_base="http://127.0.0.1:4000/v1",
            num_retries=0,
            max_retries=0,
        )
    auth.assert_called_once()
    assert requests == []


@pytest.mark.parametrize("caller", ["application", "lead", "retry"])
@pytest.mark.parametrize("model", [None, "openai/synthetic-local-model"])
@pytest.mark.parametrize("keyless", [True, False])
async def test_installation_extraction_consumers_dispatch_validated_effective_model(
    client, db, monkeypatch, offline_adapter, caplog, caller, model, keyless
):
    """Persist settings via API; keep extraction, completion and SDK construction real."""
    requests, auth, _ = offline_adapter
    monkeypatch.setenv("LITELLM_MODEL", "vertex_ai/gemini-2.0-flash")
    admin = User(
        email="adapter-admin@synthetic.test", password_hash="unused", is_admin=True
    )
    user = User(email="adapter-user@synthetic.test", password_hash="unused")
    db.add_all([admin, user])
    await db.commit()

    def headers(account):
        return {
            "Authorization": "Bearer "
            + create_access_token(
                {"sub": account.id, "session_version": account.session_version}
            )
        }

    endpoint = "http://127.0.0.1:4000/endpoint-canary/v1"
    saved = await client.put(
        "/api/admin/ai-settings",
        headers=headers(admin),
        json={
            "litellm_model": model,
            "text_keyless": keyless,
            "litellm_base_url": endpoint,
            "litellm_api_key": None if keyless else "stored-key-canary",
        },
    )
    assert saved.status_code == 200, saved.text
    state = await get_ai_settings(db)
    assert state.model == model
    assert state.is_configured
    expected_model = model or "openai/gpt-4o-mini"
    assert state.effective_model == expected_model
    disclosed = await client.get("/api/ai-capabilities", headers=headers(user))
    assert disclosed.status_code == 200
    assert disclosed.json()["text"]["model"] == expected_model
    assert disclosed.json()["text"]["available"]

    data = {"url": "https://jobs.invalid/one", "text": "Synthetic job posting"}
    if caller == "application":
        status = ApplicationStatus(
            name="Applied", color="#83a598", user_id=user.id, order=1
        )
        db.add(status)
        await db.commit()
        data["status_id"] = status.id
        path = "/api/applications/extract"
    else:
        lead = await client.post("/api/job-leads", headers=headers(user), json=data)
        assert lead.status_code == 201, lead.text
        action = "extract" if caller == "lead" else "retry"
        path = f"/api/job-leads/{lead.json()['id']}/{action}"
        data = {"expected_revision": lead.json()["revision"]}

    response = await client.post(path, headers=headers(user), json=data)
    assert response.status_code == 502, response.text
    for public_response in (saved, disclosed, response):
        assert "canary" not in public_response.text
        assert "offline" not in public_response.text
        assert "Traceback" not in public_response.text
    assert "canary" not in caplog.text
    assert "offline credential resolution blocked" not in caplog.text
    assert "offline transport blocked" not in caplog.text
    auth.assert_not_called()
    assert requests, "Must reach the installed OpenAI SDK transport boundary"
    expected_key = "tarnished-keyless" if keyless else "stored-key-canary"
    for request in requests:
        assert str(request.url) == endpoint + "/chat/completions"
        assert json.loads(request.content)["model"] == expected_model.split("/", 1)[1]
        assert request.headers["authorization"] == "Bearer " + expected_key
        assert "ambient-" not in str(request.headers)


async def test_low_level_optional_model_keeps_legacy_environment_fallback(
    monkeypatch, offline_adapter
):
    """Unrelated callers still select the ambient model; auth is blocked offline."""
    requests, auth, _ = offline_adapter
    monkeypatch.setenv("LITELLM_MODEL", "vertex_ai/gemini-2.0-flash")
    with pytest.raises(extraction.ExtractionInvalidResponseError):
        await extraction.extract_job_data(
            text="Synthetic job",
            url="https://jobs.invalid/one",
            api_key="tarnished-keyless",
            api_base="http://127.0.0.1:4000/v1",
            retry_invalid_response=False,
        )
    auth.assert_called_once()
    assert requests == []


def test_configured_credential_routes_keep_existing_behavior():
    state = AISettingsState("vertex_ai/gemini-2.0-flash", "synthetic-stored-key", None)
    assert state.is_configured
    assert state.dispatch_api_key == "synthetic-stored-key"
