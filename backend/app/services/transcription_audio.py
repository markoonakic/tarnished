"""Full local revalidation and one channel's bounded, sample-counted WAV chunks."""

import hashlib
import json
import math
import shutil
import wave
from array import array
from operator import mul
from pathlib import Path

from app.services.media_intake import (
    MAX_MEDIA_BYTES,
    run_media_process,
    validate_recording,
)

MAX_CHANNEL_CHUNKS = 13
MAX_PREPARED_BYTES = 231_000_000

# Skip near-silent PCM (about -80 dBFS) without discarding quiet speech.
SILENCE_RMS_THRESHOLD = 3


def is_effectively_silent(path: Path) -> bool:
    """True only for genuine dead air in an already-validated prepared chunk.

    Blocking byte scan; callers on the event loop must dispatch it to a thread.
    """
    total = 0
    count = 0
    with wave.open(str(path), "rb") as wav:
        frames = wav.getnframes()
        # A zero-frame/header-only file is dead air; readframes would raise EOFError.
        while frames > 0 and (block := wav.readframes(min(65536, frames))):
            samples = array("h")
            samples.frombytes(block)
            total += sum(map(mul, samples, samples))
            count += len(samples)
            frames -= len(samples)
    if not count:
        return True
    return math.sqrt(total / count) <= SILENCE_RMS_THRESHOLD


async def inspect_audio(path: Path, expected_hash: str | None):
    if not 0 < path.stat().st_size <= MAX_MEDIA_BYTES:
        raise ValueError("Recording byte limit exceeded")
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if expected_hash and digest != expected_hash:
        raise ValueError("Recording bytes changed")
    metadata = await validate_recording(path)
    probe = json.loads(
        await run_media_process(
            "probe" if metadata.media_type == "video" else "probe_audio", path
        )
    )
    audio = [stream for stream in probe["streams"] if stream["codec_type"] == "audio"]
    origin = float(probe["format"].get("start_time", 0))
    if not math.isfinite(origin) or abs(origin) > 1_000_000_000:
        raise ValueError("Unsupported audio timeline")
    if any(float(s.get("start_time", origin)) < origin - 0.001 for s in audio):
        raise ValueError("Unsupported audio timeline origin")
    return digest, metadata, audio, origin


async def prepare_channel(
    path: Path, directory: Path, track: int, channel: int, origin: float, extension: str
):
    # At most one channel (231 MB) exists at a time, independent of input length.
    if shutil.disk_usage(directory).free < MAX_PREPARED_BYTES + 256_000_000:
        raise ValueError("Insufficient temporary recording storage")
    await run_media_process(
        "prepare_channel",
        path,
        str(directory.resolve()),
        str(track),
        str(channel),
        str(origin),
        "mov" if extension in (".mp4", ".m4a") else "other",
    )
    files = sorted(directory.glob("*.wav"))
    if not 1 <= len(files) <= MAX_CHANNEL_CHUNKS:
        raise ValueError("Unsupported audio chunk count")
    frames = total_bytes = 0
    chunks = []
    for index, file in enumerate(files):
        if file.name != f"{index:03d}.wav":
            raise ValueError("Audio chunk coverage gap")
        total_bytes += file.stat().st_size
        if file.stat().st_size > 20_000_000 or total_bytes > MAX_PREPARED_BYTES:
            raise ValueError("Prepared audio exceeds storage limits")
        with wave.open(str(file), "rb") as wav:
            count = wav.getnframes()
            if (
                wav.getnchannels() != 1
                or wav.getsampwidth() != 2
                or wav.getframerate() != 16000
                or not count
            ):
                raise ValueError("Invalid prepared audio format")
            # Read through EOF to prove declared frames are actually present.
            remaining = count * 2
            while block := wav.readframes(32768):
                remaining -= len(block)
            if remaining:
                raise ValueError("Incomplete prepared audio")
        with file.open("rb") as content:
            digest = hashlib.file_digest(content, "sha256").hexdigest()
        chunks.append(
            {
                "track": track,
                "channel": channel,
                "index": index,
                "start": frames / 16000,
                "end": (frames + count) / 16000,
                "sha256": digest,
            }
        )
        frames += count
    if not 0 < frames <= 7200 * 16000:
        raise ValueError("Decoded audio exceeded two hours; no clipped result was sent")
    # Segment muxing divides actual samples without overlap. Initial silence and
    # timestamp gaps are preserved by aresample, never assigned to a speaker.
    return list(zip(files, chunks, strict=True))
