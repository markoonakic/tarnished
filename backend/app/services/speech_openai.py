"""Checked OpenAI SDK 2.30.0 audio/transcriptions JSON contract, not provider verification."""

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import httpx
from openai import AsyncOpenAI

from app.schemas.transcript import MAX_SEGMENTS, TranscriptSegment
from app.services.ai_settings import CapabilitySettingsState

MAX_CHUNK_BYTES = 20_000_000
MAX_RESPONSE_BYTES = 2_000_000


class SpeechError(ValueError):
    """No provider response, URL or credential is safe to include in an error."""


@dataclass
class SpeechResult:
    text: str
    segments: list[dict] | None = None


def sentence_segments(words) -> list[dict] | None:
    """Sentence passages built only from provider words and their own times.

    Provider segments can be long windows that span both speakers, so they cannot
    be assigned one role. Sentences are the smallest honest unit: text and times
    come from the words; nothing is estimated.
    """
    if not isinstance(words, list) or not words or len(words) > 200_000:
        return None
    sentences, current = [], []

    def close():
        if not current:
            return
        text = "".join(item["word"] for item in current).strip()
        start, end = current[0]["start"], current[-1]["end"]
        if text and end > start:
            sentences.append({"start": start, "end": end, "text": text})
        elif sentences and text:
            # A zero-length tail joins the previous sentence; no time is invented.
            sentences[-1]["text"] += " " + text
            sentences[-1]["end"] = max(sentences[-1]["end"], end)
        current.clear()

    try:
        for item in words:
            word, start, end = item["word"], item["start"], item["end"]
            if (
                not isinstance(word, str)
                or "\x00" in word
                or isinstance(start, bool)
                or isinstance(end, bool)
                or not isinstance(start, (int, float))
                or not isinstance(end, (int, float))
                or not 0 <= start <= end <= 7200
            ):
                return None
            if current and start < current[-1]["end"] - 0.5:
                return None  # Unordered words are not a reliable sentence source.
            current.append({"word": word, "start": float(start), "end": float(end)})
            if word.strip().endswith((".", "?", "!")):
                close()
        close()
    except (KeyError, TypeError):
        return None
    if not sentences or len(sentences) > MAX_SEGMENTS:
        return None
    return sentences


def parse_transcription(value) -> SpeechResult:
    if not isinstance(value, dict):
        raise SpeechError("Speech service returned unsupported transcript data")
    text = value.get("text")
    if not isinstance(text, str) or "\x00" in text:
        raise SpeechError("Speech service returned unsupported transcript data")
    text.encode("utf-8")
    sentences = sentence_segments(value.get("words"))
    if sentences:
        return SpeechResult(text=text.strip(), segments=sentences)
    raw_segments = value.get("segments")
    segments = []
    if isinstance(raw_segments, list) and len(raw_segments) <= MAX_SEGMENTS:
        try:
            for item in raw_segments:
                if isinstance(item, dict) and item.get("text") == "":
                    continue  # Empty segments carry no speech.
                segment = TranscriptSegment(
                    id=str(uuid4()),
                    text=item["text"],
                    start=item["start"],
                    end=item["end"],
                )
                if segment.start is None or segment.end is None:
                    raise ValueError("Unknown speech timing")
                segments.append(segment.model_dump(include={"start", "end", "text"}))
        except (ValueError, KeyError, TypeError):
            # Do not silently drop words from a partly malformed segment list.
            segments = []
    return SpeechResult(
        text=text.strip(),
        segments=sorted(segments, key=lambda item: item["start"]) or None,
    )


async def transcribe_chunk(
    settings: CapabilitySettingsState, path: Path
) -> SpeechResult:
    if (
        not settings.disclosure().available
        or settings.kind != "speech"
        or not settings.model
    ):
        raise SpeechError("Speech configuration is unavailable")
    if not 0 < path.stat().st_size <= MAX_CHUNK_BYTES:
        raise SpeechError("Prepared audio exceeds the speech chunk bound")
    endpoint = (settings.base_url or "").rstrip("/") + "/audio/transcriptions"

    async def request_boundary(request: httpx.Request):
        if str(request.url) != endpoint or request.method != "POST":
            raise SpeechError("Unsupported speech request route")
        request.headers["Accept-Encoding"] = "identity"
        for header in ("OpenAI-Organization", "OpenAI-Project"):
            request.headers.pop(header, None)
        if settings.keyless:
            request.headers.pop("Authorization", None)
        elif (
            request.headers.get("Authorization")
            != "Bearer " + settings.dispatch_api_key
        ):
            raise SpeechError("Speech credential boundary failed")

    async def response_boundary(response: httpx.Response):
        # SDK errors ordinarily buffer arbitrary error bodies. Reject without reading.
        if (
            response.status_code != 200
            or response.headers.get("content-encoding", "identity") != "identity"
        ):
            await response.aclose()
            raise SpeechError(
                "Speech service rejected the request; remote work may have occurred"
            )

    try:
        async with asyncio.timeout(300):
            async with (
                httpx.AsyncClient(
                    trust_env=False,
                    follow_redirects=False,
                    timeout=httpx.Timeout(60, connect=10),
                    transport=httpx.AsyncHTTPTransport(retries=0),
                    event_hooks={
                        "request": [request_boundary],
                        "response": [response_boundary],
                    },
                ) as transport,
                AsyncOpenAI(
                    api_key=settings.dispatch_api_key,
                    base_url=settings.base_url,
                    organization="",
                    project="",
                    # Do not inherit a webhook secret from the environment.
                    webhook_secret="",  # nosec B106
                    max_retries=0,
                    http_client=transport,
                ) as client,
            ):
                with path.open("rb") as audio:
                    async with (
                        client.audio.transcriptions.with_streaming_response.create(
                            file=("audio.wav", audio, "audio/wav"),
                            model=settings.model,
                            language="en",
                            response_format="verbose_json",
                            timestamp_granularities=["segment", "word"],
                        ) as response
                    ):
                        body = bytearray()
                        async for block in response.iter_bytes():
                            body.extend(block)
                            if len(body) > MAX_RESPONSE_BYTES:
                                raise SpeechError(
                                    "Speech response exceeded the normalized output limit"
                                )
                # Empty text is legitimate silence, not invented speech.
                return parse_transcription(json.loads(body))
    except asyncio.CancelledError:
        raise
    except Exception:
        raise SpeechError(
            "Speech request failed or returned unsupported data; remote work may have occurred"
        ) from None
