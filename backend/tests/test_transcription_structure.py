"""Offline automatic-section contracts; no inference or model-quality claim."""

import json
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_interview_feedback import canned
from tests.test_transcription_jobs import (
    admitted,
    claim,
    dispatched,
)
from tests.test_transcription_jobs import (
    recording as recording,
)

from app.models import Application, Round
from app.schemas.ai_settings import AISettingsUpdate
from app.schemas.transcript import CurrentTranscript, TranscriptSegment
from app.services import transcription_executor as executor_module
from app.services.ai_settings import CapabilitySettingsState, update_ai_settings
from app.services.interview_evidence import evidence_sources, snapshot
from app.services.interview_text import validate_section
from app.services.speech_openai import SpeechError, SpeechResult, parse_transcription
from app.services.transcription_executor import TranscriptionExecutor
from app.services.transcription_jobs import checkpoint, publish_result
from app.services.transcription_structure import merge_parts, structure_transcript


def speech_segments():
    return [
        {"text": "Tell me about your work.", "start": 0.0, "end": 0.2},
        {"text": "I built a service.", "start": 0.2, "end": 0.4},
        {"text": " I tested it. ", "start": 0.4, "end": 0.6},
    ]


def segments():
    return [TranscriptSegment(id=str(uuid4()), **s) for s in speech_segments()]


PARTS = [
    {"first": 0, "last": 0, "role": "interviewer"},
    {"first": 1, "last": 2, "role": "candidate"},
]


def test_old_transcript_without_structure_fields_stays_valid():
    old = {
        "id": str(uuid4()),
        "revision": 1,
        "provenance": "paste",
        "format": "txt",
        "segments": [s.model_dump() for s in segments()],
    }
    result = CurrentTranscript.model_validate(old)
    assert result.structure == "none"
    assert result.structure_model is None and result.structure_status is None


def test_verbose_json_keeps_only_original_text_and_times():
    raw = speech_segments()
    result = parse_transcription({"text": "Full text", "segments": list(reversed(raw))})
    assert result == SpeechResult("Full text", raw)
    assert result.segments is not None
    assert set(result.segments[0]) == {"text", "start", "end"}


@pytest.mark.parametrize(
    "raw",
    [
        None,
        [],
        {},
        [{"text": "words"}],
        [None],
        [{"text": "words", "start": -1, "end": 1}],
        [{"text": "words", "start": 0, "end": float("inf")}],
        [{"text": "words", "start": 0, "end": 0}],
    ],
)
def test_verbose_json_without_usable_segments_falls_back(raw):
    assert parse_transcription(
        {"text": " Fallback text ", "segments": raw}
    ) == SpeechResult("Fallback text")


def test_text_only_silence_and_unsafe_text():
    assert parse_transcription({"text": ""}) == SpeechResult("")
    with pytest.raises(SpeechError):
        parse_transcription({"text": "bad\x00text"})


def test_merge_preserves_original_text_exactly_and_has_no_speaker_identity():
    original = segments()
    result = merge_parts(json.dumps(PARTS), original)
    assert [s.text for s in result] == [
        original[0].text,
        " ".join(s.text for s in original[1:]),
    ]
    assert [(s.start, s.end, s.role) for s in result] == [
        (0, 0.2, "interviewer"),
        (0.2, 0.6, "candidate"),
    ]
    assert all(s.speaker is None for s in result)
    assert all(s.role == "unknown" for s in original)


@pytest.mark.parametrize(
    "output",
    [
        "not JSON",
        "```json\n[]\n```",
        "{}",
        "[]",
        json.dumps([PARTS[0]]),  # Missing tail.
        json.dumps([PARTS[0], {"first": 2, "last": 2, "role": "candidate"}]),  # Gap.
        json.dumps(
            [PARTS[0], {"first": 0, "last": 2, "role": "candidate"}]
        ),  # Overlap.
        json.dumps([{"first": 0, "last": 2, "role": "employer"}]),
        json.dumps([{"first": False, "last": 2, "role": "unknown"}]),
        json.dumps([{"first": 0, "last": 3, "role": "candidate"}]),
        json.dumps([{"first": 0, "last": 2, "role": "candidate", "text": "Invented"}]),
        '[{"first":0,"first":1,"last":2,"role":"candidate"}]',
    ],
)
def test_invalid_parts_rejected(output):
    with pytest.raises(ValueError):
        merge_parts(output, segments())


def test_merge_without_times_does_not_invent_them():
    original = [s.model_copy(update={"start": None, "end": None}) for s in segments()]
    assert all(
        s.start is None and s.end is None
        for s in merge_parts(json.dumps(PARTS), original)
    )


async def test_checkpoint_absolute_offsets_and_coverage(db, recording):
    job, token, first = await dispatched(db, recording)
    await checkpoint(
        db,
        job.id,
        token,
        first,
        SpeechResult("First", [{"text": "First", "start": 0.1, "end": 0.8}]),
    )
    second = {**first, "index": 1, "start": 1.0, "end": 2.0, "sha256": "b" * 64}
    job.coverage = [first, second]
    job.stage = "dispatching"
    await db.commit()
    await checkpoint(
        db,
        job.id,
        token,
        second,
        SpeechResult("Second", [{"text": "Second", "start": 0.2, "end": 0.7}]),
    )
    await db.commit()
    assert job.checkpoints[1]["segments"] == [
        {"text": "Second", "start": 1.2, "end": 1.7}
    ]
    with pytest.raises(ValueError, match="coverage"):
        await publish_result(db, job.id, token, [first])
    result = await publish_result(db, job.id, token, [first, second])
    await db.commit()
    assert [(s.start, s.end, s.text) for s in result.segments] == [
        (0.1, 0.8, "First"),
        (1.2, 1.7, "Second"),
    ]


@pytest.mark.parametrize("protocol", ["chat_completions", "responses"])
async def test_structuring_uses_checked_text_sdk_route(monkeypatch, protocol):
    calls = []
    output = json.dumps(PARTS)

    async def handle(_self, request):
        calls.append(request)
        payload = {
            "choices": [{"finish_reason": "stop", "message": {"content": output}}]
        }
        if protocol == "responses":
            payload = {
                "object": "response",
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": output}],
                    }
                ],
            }
        return httpx.Response(200, json=payload)

    monkeypatch.setenv("OPENAI_API_KEY", "ambient-canary")
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", handle)
    settings = CapabilitySettingsState(
        "openai/test-text",
        None,
        "http://test.invalid/v1",
        keyless=True,
        protocol=protocol,
    )
    job_id = str(uuid4())
    result = await structure_transcript(settings, segments(), session_id=job_id)
    assert result[1].role == "candidate" and len(calls) == 1
    request = calls[0]
    assert str(request.url) == "http://test.invalid/v1/" + (
        "responses" if protocol == "responses" else "chat/completions"
    )
    assert "authorization" not in request.headers
    assert request.headers["x-opencode-session"] == job_id
    body = json.loads(request.content)
    assert body["model"] == "test-text"
    sent = json.loads(
        body["input"] if protocol == "responses" else body["messages"][1]["content"]
    )
    assert sent == [{"index": i, **s} for i, s in enumerate(speech_segments())]
    assert "tools" not in body or body["tools"] == []


@pytest.mark.parametrize(
    "outcome", ["valid", "invalid_json", "failed", "unconfigured", "config_changed"]
)
async def test_executor_keeps_published_speech_on_structure_failure_and_roles_feed_feedback(
    db, db_engine, recording, monkeypatch, outcome
):
    owner, round, _, _ = recording
    application = await db.get(Application, round.application_id)
    application.requirements_must_have = ["Build and test services"]
    if outcome != "unconfigured":
        await update_ai_settings(
            db,
            AISettingsUpdate(
                litellm_model="openai/test-text",
                litellm_base_url="http://test.invalid/v1",
                text_keyless=True,
            ),
        )
    await db.commit()
    job = await admitted(db, recording)
    token = await claim(db, job)
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    speech = AsyncMock(return_value=SpeechResult("Original speech", speech_segments()))
    monkeypatch.setattr(executor_module, "transcribe_chunk", speech)

    async def structure(settings, original, *, session_id):
        assert session_id == job.id
        # Speech must already be durable, without a transaction held across the call.
        async with sessions() as session:
            saved = await session.get(Round, round.id)
            assert saved is not None and saved.current_transcript is not None
            assert (
                saved.current_transcript["segments"][1]["text"]
                == speech_segments()[1]["text"]
            )
            if outcome == "config_changed":
                await update_ai_settings(session, AISettingsUpdate(text_enabled=False))
                await session.commit()
        if outcome == "failed":
            raise RuntimeError("provider-private-canary")
        return merge_parts(
            "bad JSON" if outcome == "invalid_json" else json.dumps(PARTS), original
        )

    structure_mock = AsyncMock(side_effect=structure)
    monkeypatch.setattr(executor_module, "structure_transcript", structure_mock)
    executor = TranscriptionExecutor(sessions)
    executor.root.mkdir(parents=True)
    executor.accepting = True
    await executor.execute(job.id, token)
    await db.refresh(job)
    await db.refresh(round)
    result = CurrentTranscript.model_validate(round.current_transcript)
    assert job.state == "complete" and not job.uncertain and not job.checkpoints
    assert speech.await_count == 1
    assert structure_mock.await_count == (0 if outcome == "unconfigured" else 1)
    assert "canary" not in str(round.current_transcript) + str(job.error)
    if outcome == "valid":
        assert (
            result.structure == "automatic"
            and result.structure_model == "openai/test-text"
        )
        assert result.structure_status is None
        assert [s.role for s in result.segments] == ["interviewer", "candidate"]
        data, _ = await snapshot(db, owner.id, round.id)
        sources, _ = await evidence_sources(data)
        output = canned(sources)
        question = next(s for s in sources if s.get("role") == "interviewer")
        output["findings"][0]["coaching"]["question"] = {
            "source_id": question["id"],
            "quote": question["text"],
        }
        assert validate_section(output, sources, require_current_contract=True)[
            "findings"
        ]
    else:
        assert result.structure == "none" and result.structure_model is None
        assert result.structure_status == job.error == "Automatic sections unavailable"
        assert [(s.text, s.start, s.end, s.role) for s in result.segments] == [
            (s["text"], s["start"], s["end"], "unknown") for s in speech_segments()
        ]


async def test_manual_edit_during_structuring_is_not_overwritten(
    db, db_engine, recording, monkeypatch
):
    from app.services.transcripts import publish_transcript

    owner, round, _, _ = recording
    await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_model="openai/test-text",
            litellm_base_url="http://test.invalid/v1",
            text_keyless=True,
        ),
    )
    await db.commit()
    job = await admitted(db, recording)
    token = await claim(db, job)
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    monkeypatch.setattr(
        executor_module,
        "transcribe_chunk",
        AsyncMock(return_value=SpeechResult("Original", speech_segments())),
    )

    async def structure(settings, original, *, session_id):
        async with sessions() as session:
            saved = await session.get(Round, round.id)
            assert saved is not None and saved.current_transcript is not None
            value = dict(saved.current_transcript)
            value["segments"][0]["text"] = "Human correction"
            await publish_transcript(
                session,
                round.id,
                owner.id,
                saved.transcript_generation,
                {"current_transcript": value},
            )
        return merge_parts(json.dumps(PARTS), original)

    monkeypatch.setattr(executor_module, "structure_transcript", structure)
    executor = TranscriptionExecutor(sessions)
    executor.root.mkdir(parents=True)
    executor.accepting = True
    with pytest.raises(HTTPException):
        await executor.execute(job.id, token)
    await db.refresh(round)
    assert round.current_transcript["segments"][0]["text"] == "Human correction"
    assert round.current_transcript["structure"] == "none"


def test_merge_parts_accepts_one_json_fence():
    segments = [
        TranscriptSegment(
            id=str(uuid4()), text="Tell me about yourself.", start=0.0, end=2.0
        ),
        TranscriptSegment(id=str(uuid4()), text="I build APIs.", start=2.0, end=4.0),
    ]
    output = '```json\n[{"first":0,"last":0,"role":"interviewer"},{"first":1,"last":1,"role":"candidate"}]\n```'
    merged = merge_parts(output, segments)
    assert [s.role for s in merged] == ["interviewer", "candidate"]
    assert [s.text for s in merged] == ["Tell me about yourself.", "I build APIs."]


def test_words_become_timed_sentences_without_estimates():
    words = [
        {"word": " Why", "start": 0.0, "end": 0.2},
        {"word": " save", "start": 0.2, "end": 0.5},
        {"word": " nothing?", "start": 0.5, "end": 0.9},
        {"word": " Because", "start": 1.8, "end": 2.1},
        {"word": " it", "start": 2.1, "end": 2.2},
        {"word": " is", "start": 2.2, "end": 2.3},
        {"word": " safer.", "start": 2.3, "end": 2.7},
    ]
    result = parse_transcription(
        {"text": "Why save nothing? Because it is safer.", "words": words}
    )
    assert result.segments == [
        {"start": 0.0, "end": 0.9, "text": "Why save nothing?"},
        {"start": 1.8, "end": 2.7, "text": "Because it is safer."},
    ]


def test_malformed_words_fall_back_to_provider_segments():
    value = {
        "text": "Hello there.",
        "words": [{"word": " Hello", "start": "x", "end": 1}],
        "segments": [{"text": "Hello there.", "start": 0.0, "end": 1.0}],
    }
    assert parse_transcription(value).segments == [
        {"start": 0.0, "end": 1.0, "text": "Hello there."}
    ]
