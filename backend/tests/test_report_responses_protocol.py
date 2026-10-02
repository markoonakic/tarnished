"""Explicit Responses-protocol dispatch: contract, safety, and chat regression.

Synthetic contract evidence. A local socket server stands in for the provider, so no
outbound request or paid call occurs. This is not model-quality evidence.
"""

import asyncio
import json
from contextlib import asynccontextmanager

import pytest

from app.schemas.ai_settings import AISettingsUpdate
from app.services.ai_settings import CapabilitySettingsState, update_ai_settings
from app.services.interview_text import (
    SAFE_FAILURE_MESSAGES,
    ReportFailure,
    analyze_section,
    responses_output_text,
    supported,
)

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


def responses_payload(sources, *, foreign=False, status="completed", error=None):
    return json.dumps(
        {
            "id": "resp_synthetic",
            "object": "response",
            "created_at": 1,
            "model": "synthetic-text",
            "status": status,
            "parallel_tool_calls": True,
            "tool_choice": "auto",
            "tools": [],
            "top_p": 1.0,
            "temperature": 0.7,
            "output": [
                {
                    "id": "msg_synthetic",
                    "type": "message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [
                        {
                            "type": "output_text",
                            "text": json.dumps(
                                application_output(sources, foreign=foreign)
                            ),
                            "annotations": [],
                        }
                    ],
                }
            ],
            "instructions": None,
            "metadata": {},
            "error": error,
            "text": {"format": {"type": "json_object"}},
        }
    ).encode()


@asynccontextmanager
async def responses_fixture(*, status=200, body=None, foreign=False, mode="responses"):
    """A local provider stand-in that records the exact path and request body."""
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
            elif mode == "responses":
                sources = json.loads(raw["input"])["sources"]
                payload = responses_payload(sources, foreign=foreign)
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


async def test_pipeline_responses_budget_is_bounded_and_larger_than_single_record():
    sources = application_sources()
    payload = json.loads(responses_payload(sources))
    section = json.loads(payload["output"][0]["content"][0]["text"])
    section["findings"] = []  # No useful pipeline finding from application-only input.
    payload["output"][0]["content"][0]["text"] = json.dumps(section)
    async with responses_fixture(body=json.dumps(payload).encode()) as (
        endpoint,
        calls,
    ):
        await analyze_section(text_settings(endpoint), sources, [], scope="PIPELINE")
    assert len(calls) == 1
    assert calls[0][1]["max_output_tokens"] == 32000
    assert calls[0][1]["tools"] == []
    assert calls[0][1]["store"] is False


def text_settings(endpoint, protocol="responses"):
    return CapabilitySettingsState(
        model="openai/synthetic-text",
        api_key=None,
        base_url=endpoint,
        keyless=True,
        protocol=protocol,
    )


def application_sources():
    return [
        {
            "id": "job:0",
            "kind": "requirement",
            "text": "Requires Python and clear written communication.",
        },
        {
            "id": "app:0",
            "kind": "history",
            "text": "Applied on 2026-01-01; recorded status Applied.",
        },
    ]


def proxylike_payload(sources, *, foreign=False, **overrides):
    """The exact CLIProxyAPI Responses shape: reasoning + message, and the three
    SDK-required fields (tools/tool_choice/parallel_tool_calls) omitted."""
    payload = {
        "id": "chatcmpl-97123faf-synthetic",
        "object": "response",
        "created_at": 1,
        "model": "synthetic-text",
        "status": "completed",
        "error": None,
        "incomplete_details": None,
        "max_output_tokens": 4000,
        "background": False,
        "output": [
            {
                "id": "rs_synthetic",
                "type": "reasoning",
                "summary": [{"type": "summary_text", "text": "synthetic reasoning"}],
                "content": None,
                "encrypted_content": "synthetic-encrypted",
            },
            {
                "id": "msg_synthetic",
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [
                    {
                        "type": "output_text",
                        "annotations": [],
                        "text": json.dumps(
                            application_output(sources, foreign=foreign)
                        ),
                    }
                ],
            },
        ],
        "usage": {
            "input_tokens": 862,
            "output_tokens": 1980,
            "total_tokens": 2842,
            "input_tokens_details": {"cached_tokens": 512},
            "output_tokens_details": {"reasoning_tokens": 0},
        },
    }
    payload.update(overrides)
    return json.dumps(payload).encode()


# --- CLIProxy envelope compatibility (regression for the strict-SDK rejection) ---


async def test_proxylike_envelope_without_sdk_required_fields_is_accepted():
    """A real CLIProxyAPI response omitted tools/tool_choice/parallel_tool_calls."""
    async with responses_fixture(body=proxylike_payload(application_sources())) as (
        endpoint,
        calls,
    ):
        result = await analyze_section(
            text_settings(endpoint), application_sources(), [], "APPLICATION"
        )
    assert result["findings"][0]["citations"][0]["source_id"] == "job:0"
    assert len(calls) == 1


async def test_proxylike_envelope_reasoning_item_is_ignored_not_parsed():
    payload = json.loads(proxylike_payload(application_sources()))
    assert payload["output"][0]["type"] == "reasoning"
    assert "tools" not in payload and "tool_choice" not in payload
    text = responses_output_text(payload)
    assert text.startswith('{"findings"')


@pytest.mark.parametrize(
    "item_type",
    ["function_call", "tool_call", "computer_call", "web_search_call", "unknown"],
)
async def test_action_bearing_output_item_is_rejected(item_type):
    payload = json.loads(proxylike_payload(application_sources()))
    payload["output"].append({"id": "x", "type": item_type, "status": "completed"})
    with pytest.raises(ValueError):
        responses_output_text(payload)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.pop("status"),
        lambda p: p.update({"status": "incomplete"}),
        lambda p: p.update({"object": "chat.completion"}),
        lambda p: p.update({"error": {"message": "provider secret"}}),
        lambda p: p.update({"output": []}),
        lambda p: p.update({"output": p["output"][:1]}),
        lambda p: p["output"].append(p["output"][1]),
        lambda p: p["output"][1].update({"status": "incomplete"}),
        lambda p: p["output"][1].update({"role": "user"}),
        lambda p: p["output"][1].update({"content": []}),
        lambda p: p["output"][1]["content"].append(
            {"type": "output_text", "text": "{}", "annotations": []}
        ),
        lambda p: p["output"][1].update(
            {"content": [{"type": "refusal", "refusal": "no"}]}
        ),
    ],
)
async def test_malformed_envelope_is_invalid_not_grounding(mutate):
    payload = json.loads(proxylike_payload(application_sources()))
    mutate(payload)
    with pytest.raises(ValueError):
        responses_output_text(payload)


async def test_proxylike_envelope_still_enforces_grounding():
    async with responses_fixture(
        body=proxylike_payload(application_sources(), foreign=True)
    ) as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "report_grounding"
    assert len(calls) == 1


async def test_proxylike_duplicate_output_text_key_is_invalid():
    payload = json.loads(proxylike_payload(application_sources()))
    duplicate = json.dumps(payload).replace(
        '"status": "completed"', '"status": "completed", "status": "completed"', 1
    )
    async with responses_fixture(body=duplicate.encode()) as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "provider_response_invalid"
    assert "synthetic reasoning" not in raised.value.safe_message
    assert len(calls) == 1


async def test_proxylike_action_item_over_wire_is_invalid():
    payload = json.loads(proxylike_payload(application_sources()))
    payload["output"].append(
        {"id": "t", "type": "function_call", "status": "completed"}
    )
    async with responses_fixture(body=json.dumps(payload).encode()) as (
        endpoint,
        calls,
    ):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "provider_response_invalid"
    assert len(calls) == 1


# --- settings round trip and revision semantics ---


async def test_text_protocol_round_trips_and_bumps_only_text_revision(db):
    first = await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_model="openai/synthetic-text",
            litellm_base_url="http://127.0.0.1:9/v1",
            text_keyless=True,
            text_protocol="responses",
        ),
    )
    assert first.protocol == "responses"
    assert first.admin_response().text_protocol == "responses"
    text_revision = first.revision

    # Unchanged protocol is a changed-only no-op: no new revision.
    same = await update_ai_settings(db, AISettingsUpdate(text_protocol="responses"))
    assert same.revision == text_revision

    # Changing the protocol bumps the text revision.
    changed = await update_ai_settings(
        db, AISettingsUpdate(text_protocol="chat_completions")
    )
    assert changed.protocol == "chat_completions"
    assert changed.revision != text_revision


async def test_default_protocol_is_chat_completions(db):
    settings = await update_ai_settings(db, AISettingsUpdate(text_enabled=True))
    assert settings.protocol == "chat_completions"
    assert settings.admin_response().text_protocol == "chat_completions"


# --- dispatch contract ---


async def test_responses_success_uses_responses_path_and_parses_output_text():
    async with responses_fixture() as (endpoint, calls):
        result = await analyze_section(
            text_settings(endpoint), application_sources(), [], "APPLICATION"
        )
    assert result["findings"][0]["citations"][0]["source_id"] == "job:0"
    headers, raw = calls[0]
    # One dispatch to the exact Responses path, not chat/completions.
    assert len(calls) == 1
    assert headers.startswith(b"POST /v1/responses ")
    assert "instructions" in raw and raw["instructions"]
    assert json.loads(raw["input"])["sources"]
    assert raw["tools"] == [] and raw["stream"] is False and raw["store"] is False
    assert raw["text"]["format"]["type"] == "json_object"
    # The Responses path sends the named bounded headroom constant.
    assert raw["max_output_tokens"] == 12000


def incomplete_payload(reason="max_output_tokens"):
    """A valid envelope that stopped early at the output limit: reasoning only."""
    payload = json.loads(proxylike_payload(application_sources()))
    payload["status"] = "incomplete"
    payload["incomplete_details"] = {"reason": reason}
    payload["max_output_tokens"] = 12000
    payload["output"] = [payload["output"][0]]
    payload["usage"] = {
        "input_tokens": 862,
        "output_tokens": 12000,
        "total_tokens": 12862,
        "input_tokens_details": {"cached_tokens": 0},
        "output_tokens_details": {"reasoning_tokens": 0},
    }
    return json.dumps(payload).encode()


async def test_responses_incomplete_output_limit_maps_to_own_safe_category():
    """The exact real failing envelope: status=incomplete, reason=max_output_tokens."""
    async with responses_fixture(body=incomplete_payload()) as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "provider_output_limit"
    assert raised.value.safe_message == SAFE_FAILURE_MESSAGES["provider_output_limit"]
    assert "synthetic reasoning" not in raised.value.safe_message
    assert len(raised.value.safe_message) <= 300
    assert len(calls) == 1


async def test_responses_incomplete_other_reason_stays_invalid():
    async with responses_fixture(body=incomplete_payload(reason="content_filter")) as (
        endpoint,
        calls,
    ):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "provider_response_invalid"
    assert len(calls) == 1


async def test_responses_incomplete_envelope_is_still_rejected_by_parser():
    """Partial reasoning/no-message output must never be accepted as a report."""
    payload = json.loads(incomplete_payload())
    with pytest.raises(ValueError):
        responses_output_text(payload)


async def test_chat_protocol_still_uses_chat_completions_path():
    """Regression: the default path must be unchanged."""
    async with responses_fixture(mode="chat") as (endpoint, calls):
        result = await analyze_section(
            text_settings(endpoint, protocol="chat_completions"),
            application_sources(),
            [],
            "APPLICATION",
        )
    assert result["findings"][0]["citations"][0]["source_id"] == "job:0"
    headers, raw = calls[0]
    assert headers.startswith(b"POST /v1/chat/completions ")
    assert "messages" in raw and raw["messages"][0]["role"] == "system"
    # Chat Completions keeps its existing 4_000-token cap unchanged.
    assert raw["max_tokens"] == 4000


async def test_responses_incomplete_status_is_invalid_not_grounding():
    async with responses_fixture(
        body=json.dumps(
            {
                "id": "resp_x",
                "object": "response",
                "created_at": 1,
                "model": "m",
                "status": "incomplete",
                "output": [],
                "parallel_tool_calls": True,
                "tool_choice": "auto",
                "tools": [],
                "top_p": 1.0,
                "temperature": 0.7,
                "instructions": None,
                "metadata": {},
                "error": None,
                "text": {"format": {"type": "json_object"}},
            }
        ).encode()
    ) as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "provider_response_invalid"
    assert len(calls) == 1


async def test_responses_nonzero_status_maps_to_safe_category_and_hides_body():
    async with responses_fixture(status=429, body=SECRET_BODY) as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "provider_rate_limit"
    assert raised.value.safe_message == SAFE_FAILURE_MESSAGES["provider_rate_limit"]
    assert "DEADBEEF" not in raised.value.safe_message
    assert "sk-live" not in raised.value.safe_message
    assert len(calls) == 1


async def test_responses_foreign_citation_fails_grounding():
    async with responses_fixture(foreign=True) as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "report_grounding"
    assert len(calls) == 1


async def test_responses_invalid_json_is_invalid_not_grounding():
    async with responses_fixture(body=b"not json at all") as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "provider_response_invalid"
    assert len(calls) == 1


async def test_responses_no_automatic_retry_on_server_error():
    async with responses_fixture(status=503, body=SECRET_BODY) as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), application_sources(), [], "APPLICATION"
            )
    assert raised.value.category == "provider_unavailable"
    # Exactly one dispatch: no SDK retry, no application retry.
    assert len(calls) == 1


async def test_responses_requires_configuration_before_dispatch():
    settings = CapabilitySettingsState(
        model=None, api_key=None, base_url=None, keyless=True, protocol="responses"
    )
    assert supported(settings) is False
    with pytest.raises(ReportFailure) as raised:
        await analyze_section(settings, application_sources(), [], "APPLICATION")
    assert raised.value.category == "configuration"


async def test_section_transport_has_no_read_bound_shorter_than_declared_budget():
    """Regression: a hidden per-read cap must not abort a request the budget allows.

    Measured live: a PIPELINE (32k output budget) reasoning request returned in ~90s.
    The old `httpx.Timeout(60, ...)` aborted it at ~60s while the declared 180s
    deadline still allowed it. The declared deadline must be the only read bound.
    """
    from app.services.interview_text import (
        CONNECT_TIMEOUT_SECONDS,
        SECTION_REQUEST_TIMEOUT_SECONDS,
        _openai_transport,
    )

    settings = text_settings("http://127.0.0.1:1/v1")
    async with _openai_transport(
        settings, "http://127.0.0.1:1/v1/responses"
    ) as transport:
        assert transport.timeout.read is None
        assert transport.timeout.connect == CONNECT_TIMEOUT_SECONDS
        assert CONNECT_TIMEOUT_SECONDS < SECTION_REQUEST_TIMEOUT_SECONDS
