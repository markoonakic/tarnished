"""Report provider failure classification: safe, discriminating, provider-body-free.

Synthetic contract evidence. No outbound provider call; a local socket server stands
in for the provider. This is not model-quality evidence.
"""

import asyncio
import json
import socket
import ssl
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace

from app.models import InterviewJob
from app.schemas.ai_settings import AISettingsUpdate
from app.services.ai_settings import update_ai_settings
from app.services.interview_text import (
    SAFE_FAILURE_MESSAGES,
    ReportFailure,
    _BoundaryError,
    _openai_transport,
    _ProviderStatusError,
    classify_report_failure,
    report_failure_message,
)
from app.services.transcription_executor import TranscriptionExecutor

# A provider body that must never be echoed into the durable error or the API.
SECRET_BODY = b'{"error":{"message":"provider secret apikey sk-live-DEADBEEF"}}'


def application_output(sources, *, foreign=False):
    requirement = next((s for s in sources if s["kind"] == "requirement"), None)
    cited = [requirement] if requirement else sources[:1]
    if foreign:
        source_id, quote = "foreign:secret", "x"
    elif cited:
        source_id, quote = cited[0]["id"], (cited[0]["text"] or "x")[:200]
    else:
        source_id, quote = "x:0", "x"
    return {
        "findings": [
            {
                "subject": "application",
                "coaching": {
                    "version": 1,
                    "kind": "application",
                    "title": "Check the recorded next step",
                    "context_citations": [0],
                    "branches": [
                        {
                            "condition": "If these are still the current details",
                            "action": "Check your own notes before taking the next step.",
                        }
                    ],
                },
                "observation": "The application has recorded history for this timeline.",
                "interpretation": "Recorded stage evidence only; employer motives are unknown.",
                "action": "Continue the recorded next step and keep history current.",
                "limitations": "One application; current documents are not historical submission proof.",
                "citations": [{"source_id": source_id, "quote": quote}],
            }
        ],
        "limitations": [],
    }


@asynccontextmanager
async def provider_fixture(*, status=200, body=None, foreign=False):
    """A local provider stand-in. Returns (endpoint, calls)."""
    calls, tasks = [], set()
    payload_body = body

    async def handle(reader, writer):
        task = asyncio.current_task()
        tasks.add(task)
        try:
            headers = await reader.readuntil(b"\r\n\r\n")
            length = int(
                next(
                    line.split(b":", 1)[1]
                    for line in headers.split(b"\r\n")
                    if line.lower().startswith(b"content-length:")
                )
            )
            raw = json.loads(await reader.readexactly(length))
            calls.append((headers, raw))
            if payload_body is not None:
                payload = payload_body
            else:
                sources = json.loads(raw["messages"][1]["content"])["sources"]
                payload = json.dumps(
                    {
                        "choices": [
                            {
                                "finish_reason": "stop",
                                "message": {
                                    "content": json.dumps(
                                        application_output(sources, foreign=foreign)
                                    )
                                },
                            }
                        ]
                    }
                ).encode()
            writer.write(
                f"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\n"
                f"Content-Length: {len(payload)}\r\nConnection: close\r\n\r\n".encode()
                + payload
            )
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()
            tasks.discard(task)

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    try:
        yield f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}/v1", calls
    finally:
        server.close()
        await server.wait_closed()
        for task in list(tasks):
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def _free_closed_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


async def configure(db, endpoint):
    await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_model="openai/synthetic-text",
            litellm_base_url=endpoint,
            text_keyless=True,
        ),
    )


async def wait_state(sessions, **match):
    async with asyncio.timeout(30):
        while True:
            async with sessions() as session:
                job = await session.scalar(
                    select(InterviewJob)
                    .filter_by(**match)
                    .order_by(InterviewJob.created_at.desc())
                )
                if job and job.state not in ("queued", "analyzing"):
                    return job
            await asyncio.sleep(0.05)


async def run_report(client, db, db_engine, workspace, tmp_path, endpoint):
    from app.main import app

    _owner, _, _, _types, app_id = workspace
    await configure(db, endpoint)
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    executor = TranscriptionExecutor(sessions, tmp_path)
    app.state.transcription_executor = executor
    state = (await client.get(f"/api/applications/{app_id}/feedback")).json()
    async with executor.lifespan():
        response = await client.post(
            f"/api/applications/{app_id}/feedback",
            json={
                "intent_id": str(uuid4()),
                "generation": state["generation"],
                "config_revision": state["capability"]["configuration_revision"],
            },
        )
        assert response.status_code == 202, response.text
        job = await wait_state(sessions, scope="APPLICATION", application_id=app_id)
    read = (await client.get(f"/api/applications/{app_id}/feedback")).json()
    return job, read


# --- unit classification: each category, by real exception shape ---


def _wrapped(*chain):
    """Build a cause chain like the SDK produces (outermost first)."""
    outer = chain[0]()
    for factory in chain[1:]:
        outer.__cause__ = factory()
    return outer


def test_classify_each_category_from_real_exception_shapes():
    cases = [
        (
            "provider_auth",
            _wrapped(
                lambda: __import__("openai").APIConnectionError(request=None),
                lambda: _ProviderStatusError(401),
            ),
        ),
        (
            "provider_auth",
            _wrapped(
                lambda: __import__("openai").APIConnectionError(request=None),
                lambda: _ProviderStatusError(403),
            ),
        ),
        (
            "provider_rate_limit",
            _wrapped(
                lambda: __import__("openai").APIConnectionError(request=None),
                lambda: _ProviderStatusError(429),
            ),
        ),
        (
            "provider_request",
            _wrapped(
                lambda: __import__("openai").APIConnectionError(request=None),
                lambda: _ProviderStatusError(400),
            ),
        ),
        (
            "provider_unavailable",
            _wrapped(
                lambda: __import__("openai").APIConnectionError(request=None),
                lambda: _ProviderStatusError(503),
            ),
        ),
        (
            "connection",
            _wrapped(
                lambda: Exception("boom"),
                lambda: httpx.ConnectError("no route"),
                lambda: OSError("refused"),
            ),
        ),
        (
            "connection",
            _wrapped(
                lambda: Exception("boom"),
                lambda: socket.gaierror("name resolution"),
            ),
        ),
        (
            "connection",
            _wrapped(lambda: Exception("boom"), lambda: ssl.SSLError("bad cert")),
        ),
        (
            "timeout",
            _wrapped(lambda: Exception("boom"), lambda: httpx.ReadTimeout("too slow")),
        ),
        (
            "provider_response_invalid",
            _wrapped(
                lambda: Exception("boom"),
                lambda: json.JSONDecodeError("bad", "x", 0),
            ),
        ),
        (
            "configuration",
            _wrapped(lambda: Exception("boom"), lambda: _BoundaryError("boundary")),
        ),
        ("unknown", _wrapped(lambda: RuntimeError("mystery"))),
    ]
    for expected, exc in cases:
        assert classify_report_failure(exc).category == expected


def test_every_safe_message_is_short_and_secret_free():
    assert set(SAFE_FAILURE_MESSAGES) == {
        "configuration",
        "connection",
        "timeout",
        "provider_auth",
        "provider_rate_limit",
        "provider_request",
        "provider_unavailable",
        "provider_response_invalid",
        "provider_output_limit",
        "report_grounding",
        "unknown",
    }
    for category, message in SAFE_FAILURE_MESSAGES.items():
        assert message and len(message) <= 300, category
        lowered = message.lower()
        for banned in ("http://", "https://", "bearer ", "api_key", "apikey", "sk-"):
            assert banned not in lowered, (category, banned)


def test_report_failure_message_passthrough_and_generic_fallback():
    failure = ReportFailure("provider_auth", SAFE_FAILURE_MESSAGES["provider_auth"])
    assert report_failure_message(failure) == SAFE_FAILURE_MESSAGES["provider_auth"]
    assert (
        report_failure_message(RuntimeError("raw")) == SAFE_FAILURE_MESSAGES["unknown"]
    )


# --- integration: durable job error, redaction, no automatic retry ---


@pytest.mark.parametrize(
    ("status", "body", "expected"),
    [
        (401, SECRET_BODY, "provider_auth"),
        (403, SECRET_BODY, "provider_auth"),
        (429, SECRET_BODY, "provider_rate_limit"),
        (400, SECRET_BODY, "provider_request"),
        (500, SECRET_BODY, "provider_unavailable"),
        (200, b"not json at all", "provider_response_invalid"),
    ],
)
async def test_durable_error_is_the_safe_category_and_never_the_provider_body(
    client, db, db_engine, workspace, tmp_path, status, body, expected
):
    async with provider_fixture(status=status, body=body) as (endpoint, calls):
        job, read = await run_report(
            client, db, db_engine, workspace, tmp_path, endpoint
        )
    assert job.state == "failed", job.error
    assert job.error == SAFE_FAILURE_MESSAGES[expected], job.error
    # The provider body must never reach the durable error or the API surface.
    for surface in (job.error, json.dumps(read), read.get("error") or ""):
        assert "DEADBEEF" not in (surface or "")
        assert "sk-live" not in (surface or "")
    assert read["report"] is None
    # No automatic retry: exactly one provider dispatch for one section.
    assert len(calls) == 1


async def test_grounding_failure_is_classified_not_generic(
    client, db, db_engine, workspace, tmp_path
):
    async with provider_fixture(foreign=True) as (endpoint, calls):
        job, read = await run_report(
            client, db, db_engine, workspace, tmp_path, endpoint
        )
    assert job.state == "failed", job.error
    assert job.error == SAFE_FAILURE_MESSAGES["report_grounding"], job.error
    assert len(calls) == 1


async def test_connection_failure_is_classified(
    client, db, db_engine, workspace, tmp_path
):
    port = _free_closed_port()
    job, _read = await run_report(
        client, db, db_engine, workspace, tmp_path, f"http://127.0.0.1:{port}/v1"
    )
    assert job.state == "failed", job.error
    assert job.error == SAFE_FAILURE_MESSAGES["connection"], job.error


async def test_successful_report_still_completes_and_publishes(
    client, db, db_engine, workspace, tmp_path
):
    """The classification boundary must not change the good path."""
    async with provider_fixture() as (endpoint, calls):
        job, read = await run_report(
            client, db, db_engine, workspace, tmp_path, endpoint
        )
    assert job.state == "complete", job.error
    assert calls
    assert read["report"] is not None
    assert read["report"]["scope"] == "APPLICATION"
    assert read["stale_reason"] is None


@pytest.mark.parametrize("status", [400, 422])
async def test_rejection_hook_logs_only_bounded_allowlisted_metadata(caplog, status):
    settings = SimpleNamespace(keyless=True)
    endpoint = "https://synthetic.invalid/v1/responses"
    response = httpx.Response(
        status,
        json={
            "error": {
                "type": "invalid_request_error",
                "code": "unsupported_parameter",
                "param": "text.format",
                "message": "secret sk-live-DEADBEEF https://private.invalid/?token=private",
            }
        },
        request=httpx.Request("POST", endpoint),
    )
    with caplog.at_level("WARNING"):
        async with _openai_transport(settings, endpoint) as transport:
            with pytest.raises(_ProviderStatusError) as raised:
                await transport.event_hooks["response"][0](response)
    assert raised.value.status_code == status
    assert response.is_closed
    assert f"http_status={status}" in caplog.text
    assert "error_type=invalid_request_error" in caplog.text
    assert "error_code=unsupported_parameter" in caplog.text
    assert "error_param=text.format" in caplog.text
    for private in ("DEADBEEF", "private.invalid", "token=", "synthetic.invalid"):
        assert private not in caplog.text


@pytest.mark.parametrize(
    "body",
    [
        b'{"error":{"code":"sk-secret","type":"https://private.invalid","param":"private text","message":"secret"}}',
        b'{"error":{"code":"invalid_json_schema"},"padding":"' + b"x" * 9000 + b'"}',
        b"not json secret",
    ],
)
async def test_rejection_diagnostics_omit_unknown_oversized_and_invalid_bodies(
    caplog, body
):
    response = httpx.Response(400, content=body)
    with caplog.at_level("WARNING"):
        async with _openai_transport(
            SimpleNamespace(keyless=True), "https://synthetic.invalid/v1/responses"
        ) as transport:
            with pytest.raises(_ProviderStatusError):
                await transport.event_hooks["response"][0](response)
    assert "http_status=400" in caplog.text
    assert "error_code=omitted" in caplog.text
    assert "error_type=omitted" in caplog.text
    assert "error_param=omitted" in caplog.text
    assert "secret" not in caplog.text
    assert "private.invalid" not in caplog.text
