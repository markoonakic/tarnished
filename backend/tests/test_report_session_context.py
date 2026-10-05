"""Offline session metadata at the real SDK wire and durable dispatcher boundaries."""

import asyncio
import json
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_interview_feedback import setup_round
from tests.test_report_responses_protocol import (
    application_sources,
    responses_fixture,
    text_settings,
)

from app.core.security import create_access_token
from app.models import InterviewJob
from app.schemas.ai_settings import AISettingsUpdate
from app.services import interview_jobs as jobs
from app.services.ai_settings import update_ai_settings
from app.services.interview_text import ReportFailure, analyze_section
from app.services.transcription_executor import TranscriptionExecutor


def session_header(headers):
    values = [
        line.split(b":", 1)[1].strip().decode()
        for line in headers.split(b"\r\n")
        if line.lower().startswith(b"x-opencode-session:")
    ]
    assert len(values) == 1
    UUID(values[0])
    assert b"opencode" not in next(
        line.lower()
        for line in headers.split(b"\r\n")
        if line.lower().startswith(b"user-agent:")
    )
    return values[0]


def empty_output(protocol):
    section = json.dumps({"findings": [], "limitations": []})
    if protocol == "responses":
        return json.dumps(
            {
                "object": "response",
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": section}],
                    }
                ],
            }
        ).encode()
    return json.dumps(
        {"choices": [{"finish_reason": "stop", "message": {"content": section}}]}
    ).encode()


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_job_session_header_is_stable_and_body_unchanged(protocol, caplog):
    first, second = str(uuid4()), str(uuid4())
    async with responses_fixture(body=empty_output(protocol)) as (endpoint, calls):
        settings = text_settings(endpoint, protocol)
        for context in (first, first, second):
            result = await analyze_section(
                settings, application_sources(), [], "APPLICATION", session_id=context
            )
            assert context not in json.dumps(result)
        assert len(calls) == 3
        assert [session_header(headers) for headers, _ in calls] == [
            first,
            first,
            second,
        ]
        assert calls[0][1] == calls[1][1] == calls[2][1]
        assert first not in json.dumps(calls[0][1])
        assert "session_id" not in calls[0][1]
    assert first not in caplog.text and second not in caplog.text


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_legacy_direct_call_gets_distinct_standalone_context(protocol):
    async with responses_fixture(body=empty_output(protocol)) as (endpoint, calls):
        for _ in range(2):
            await analyze_section(text_settings(endpoint, protocol), [], [])
    assert len(calls) == 2
    assert session_header(calls[0][0]) != session_header(calls[1][0])


@pytest.mark.parametrize("session_id", ["", "not-a-uuid", "\r\nInjected: true"])
async def test_invalid_context_fails_before_dispatch_without_echo(session_id):
    async with responses_fixture() as (endpoint, calls):
        with pytest.raises(ReportFailure) as raised:
            await analyze_section(
                text_settings(endpoint), [], [], session_id=session_id
            )
    assert raised.value.category == "configuration"
    assert "Injected" not in str(raised.value)
    assert calls == []


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
async def test_dispatcher_uses_job_not_claim_across_sections_and_reentry(
    client, db, workspace, monkeypatch, protocol, scope, caplog
):
    from app.main import app

    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    executor = TranscriptionExecutor(sessions)
    executor.accepting = True
    monkeypatch.setattr(app.state, "transcription_executor", executor, raising=False)
    async with responses_fixture(body=empty_output(protocol)) as (endpoint, calls):
        rid = await setup_round(client, db, workspace, endpoint)
        await update_ai_settings(db, AISettingsUpdate(text_protocol=protocol))
        path = {
            "INTERVIEW": f"/api/rounds/{rid}/interview-feedback",
            "APPLICATION": f"/api/applications/{workspace[4]}/feedback",
            "PIPELINE": "/api/analytics/feedback",
        }[scope]

        async def admit():
            state = (await client.get(path)).json()
            data = {
                "intent_id": str(uuid4()),
                "config_revision": state["capability"]["configuration_revision"],
            }
            if scope != "PIPELINE":
                data["generation"] = state["generation"]
            response = await client.post(path, json=data)
            assert response.status_code == 202, response.text
            job_id = response.json()["id"]
            job = await db.scalar(select(InterviewJob).where(InterviewJob.id == job_id))
            job.state, job.claim_id = "analyzing", str(uuid4())
            await db.commit()
            return job_id, job.claim_id

        # Supply two evidence batches, not a fake dispatch or a generated header.
        original_evidence = jobs._scope_evidence

        async def two_batches(scope, data):
            sources, limits, _ = await original_evidence(scope, data)
            return sources, limits, [sources, sources]

        monkeypatch.setattr(jobs, "_scope_evidence", two_batches)
        job_id, claim = await admit()
        original_checkpoint = jobs.checkpoint

        async def interrupt_before_checkpoint(*args, **kwargs):
            raise asyncio.CancelledError

        monkeypatch.setattr(jobs, "checkpoint", interrupt_before_checkpoint)
        with pytest.raises(asyncio.CancelledError):
            await jobs.execute(executor, job_id, claim)
        interrupted_calls = 2 if scope == "PIPELINE" else 1
        assert len(calls) == interrupted_calls  # No retry of the uncertain wave.
        # Explicit synthetic re-entry under another claim, not a new job or an
        # automatic resume policy. Production failure/recovery rules stay unchanged.
        job = await db.get(InterviewJob, job_id, populate_existing=True)
        job.claim_id = str(uuid4())
        claim = job.claim_id
        await db.commit()
        monkeypatch.setattr(jobs, "checkpoint", original_checkpoint)
        await jobs.execute(executor, job_id, claim)
        completed_calls = interrupted_calls + 2
        assert len(calls) == completed_calls
        assert [session_header(headers) for headers, _ in calls] == [
            job_id
        ] * completed_calls
        report = (await client.get(path)).json()["report"]
        assert report is not None and job_id not in json.dumps(report)
        assert "x-opencode-session" not in json.dumps(report)
        assert job_id not in caplog.text
        next_id, next_claim = await admit()
        await jobs.execute(executor, next_id, next_claim)
        assert len(calls) == completed_calls + 2 and next_id != job_id
        assert [session_header(headers) for headers, _ in calls[completed_calls:]] == [
            next_id
        ] * 2
        if scope == "PIPELINE":
            other = workspace[1]
            client.headers["Authorization"] = "Bearer " + create_access_token(
                {"sub": other.id, "session_version": other.session_version}
            )
            other_id, other_claim = await admit()
            await jobs.execute(executor, other_id, other_claim)
            assert len(calls) == completed_calls + 4 and other_id not in (
                job_id,
                next_id,
            )
            assert [
                session_header(headers) for headers, _ in calls[completed_calls + 2 :]
            ] == [other_id] * 2
            assert other.id not in session_header(calls[completed_calls + 2][0])
