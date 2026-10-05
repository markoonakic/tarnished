"""Reasoning metadata must not consume the bounded visible-report allowance."""

import json

import pytest
from tests.test_feedback_contract import envelope
from tests.test_report_responses_protocol import (
    application_sources,
    proxylike_payload,
    responses_fixture,
    text_settings,
)

from app.services import interview_text as text


def response_body(protocol, *, reasoning=0, report=None):
    payload = json.loads(proxylike_payload(application_sources()))
    content = payload["output"][1]["content"][0]["text"] if report is None else report
    if protocol == "responses":
        payload["output"][0]["summary"][0]["text"] = "x" * reasoning
        payload["output"][1]["content"][0]["text"] = content
    else:
        payload = {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "content": content,
                        "reasoning_content": "x" * reasoning,
                    },
                }
            ]
        }
    return json.dumps(payload).encode()


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_large_reasoning_envelope_keeps_a_small_valid_report(protocol):
    body = response_body(protocol, reasoning=text.MAX_RESPONSE_BYTES + 1)
    assert text.MAX_RESPONSE_BYTES < len(body) < text.MAX_REPORT_ENVELOPE_BYTES
    async with responses_fixture(body=body) as (endpoint, calls):
        result = await text.analyze_section(
            text_settings(endpoint, protocol), application_sources(), [], "APPLICATION"
        )
    assert result["findings"]
    assert len(calls) == 1


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
@pytest.mark.parametrize("large", ["envelope", "report"])
async def test_report_text_and_envelope_each_have_a_hard_byte_limit(protocol, large):
    body = response_body(
        protocol,
        reasoning=text.MAX_REPORT_ENVELOPE_BYTES if large == "envelope" else 0,
        report=" " * (text.MAX_RESPONSE_BYTES + 1) if large == "report" else None,
    )
    async with responses_fixture(body=body) as (endpoint, calls):
        with pytest.raises(text.ReportFailure) as error:
            await text.analyze_section(
                text_settings(endpoint, protocol),
                application_sources(),
                [],
                "APPLICATION",
            )
    assert error.value.category == "provider_response_invalid"
    assert len(calls) == 1


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
@pytest.mark.parametrize(
    "scope,deadline", [("INTERVIEW", 180), ("APPLICATION", 180), ("PIPELINE", 300)]
)
async def test_scoped_deadline_is_bounded_without_automatic_retry(
    monkeypatch, protocol, scope, deadline
):
    budgets = []
    timeout = text.asyncio.timeout

    def capture(value):
        budgets.append(value)
        return timeout(value)

    monkeypatch.setattr(text.asyncio, "timeout", capture)
    body = envelope({"findings": [], "limitations": []}, protocol)
    async with responses_fixture(body=body) as (endpoint, calls):
        await text.analyze_section(text_settings(endpoint, protocol), [], [], scope)
    assert deadline in budgets
    assert len(calls) == 1
