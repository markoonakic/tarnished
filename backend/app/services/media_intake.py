"""One bounded local recording intake. No provider dispatch or transcript provenance."""

import asyncio
import fcntl
import hashlib
import json
import math
import os
import shutil
import signal
import sys
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, Request
from python_multipart import MultipartParser
from python_multipart.exceptions import MultipartParseError
from python_multipart.multipart import parse_options_header

from app.api.utils.zip_utils import sanitize_filename
from app.core.config import get_settings

MAX_MEDIA_BYTES = 1_000_000_000
MAX_MEDIA_SECONDS = 7_200
MAX_ENVELOPE_BYTES = 16_384
CHUNK_BYTES = 65_536
UPLOAD_SECONDS = 3_600
PROCESS_SECONDS = 180
PROCESS_OUTPUT_BYTES = 65_536
# Reserve space for the entire upload, plus DB/ordinary attachment headroom.
DISK_RESERVE_BYTES = 256_000_000
AUDIO_CODECS = {
    "aac",
    "mp3",
    "opus",
    "vorbis",
    "flac",
    "alac",
    "pcm_s16le",
    "pcm_s24le",
    "pcm_s32le",
    "pcm_f32le",
    "pcm_f64le",
    "pcm_u8",
}


@dataclass(frozen=True)
class ProbedMedia:
    media_type: str
    extension: str
    duration: float


@contextmanager
def intake_slot(upload_root: Path):
    """Stable-inode disk/admission guard; one process/replica is the supported baseline.

    A crash can leave only this one private part file. Reclaim it only after taking
    its lock; never unlink the lock inode or opportunistically remove CAS blobs.
    """
    root = upload_root.resolve() / ".media-intake"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (root / "lock").open("a+b") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise HTTPException(
                503, "Another recording is being validated. Retry later"
            ) from exc
        path = root / "recording.part"
        try:
            path.unlink(missing_ok=True)
            if shutil.disk_usage(root).free < MAX_MEDIA_BYTES + DISK_RESERVE_BYTES:
                raise HTTPException(
                    507,
                    "Not enough recording storage. Ask the operator to free or expand storage",
                )
            yield path
        finally:
            path.unlink(missing_ok=True)
            fcntl.flock(lock, fcntl.LOCK_UN)


async def spool_recording(request: Request, path: Path) -> tuple[str, str, int]:
    """Parse exactly one multipart file straight to owned disk, after authentication.

    Do not use UploadFile here: FastAPI parses/spools it before dependencies run.
    Header/part counts, envelope, file, elapsed time and idle time are independent.
    """
    content_type = request.headers.get("content-type", "")
    if len(content_type) > 256:
        raise HTTPException(400, "Invalid recording multipart content type")
    kind, options = parse_options_header(content_type)
    boundary = options.get(b"boundary", b"")
    if kind != b"multipart/form-data" or not 1 <= len(boundary) <= 70:
        raise HTTPException(400, "Send one recording as multipart field 'file'")
    length = request.headers.get("content-length")
    if length is not None:
        if not length.isascii() or not length.isdecimal() or len(length) > 12:
            raise HTTPException(400, "Invalid recording content length")
        if int(length) > MAX_MEDIA_BYTES + MAX_ENVELOPE_BYTES:
            raise HTTPException(
                413,
                "Recording request exceeds 1,000,000,000 bytes plus 16,384 bytes multipart overhead",
            )
    size = total = header_bytes = parts = 0
    complete = headers_complete = False
    headers: dict[bytes, bytes] = {}
    field = bytearray()
    value = bytearray()
    filename = ""
    digest = hashlib.sha256()
    with path.open("xb") as target:

        def part_begin():
            nonlocal parts
            parts += 1
            if parts != 1:
                raise HTTPException(
                    400, "Send exactly one recording and no extra form fields"
                )

        def header_data(destination, data, start, end):
            nonlocal header_bytes
            header_bytes += end - start
            if header_bytes > 8_192:
                raise HTTPException(413, "Recording multipart headers are too large")
            destination.extend(data[start:end])

        def header_end():
            key = bytes(field).lower()
            if key in headers or len(headers) >= 4:
                raise HTTPException(400, "Invalid recording multipart headers")
            headers[key] = bytes(value)
            field.clear()
            value.clear()

        def headers_finished():
            nonlocal filename, headers_complete
            disposition, params = parse_options_header(
                headers.get(b"content-disposition", b"")
            )
            if (
                disposition != b"form-data"
                or params.get(b"name") != b"file"
                or b"filename" not in params
            ):
                raise HTTPException(400, "Send one recording as multipart field 'file'")
            filename = sanitize_filename(
                params[b"filename"].decode("utf-8", errors="replace")
            )
            headers_complete = True

        def part_data(data, start, end):
            nonlocal size
            if not headers_complete:
                raise HTTPException(400, "Invalid recording multipart data")
            size += end - start
            if size > MAX_MEDIA_BYTES:
                raise HTTPException(413, "Recording exceeds 1,000,000,000 bytes")
            block = memoryview(data)[start:end]
            digest.update(block)
            target.write(block)

        def end():
            nonlocal complete
            complete = True

        parser = MultipartParser(
            boundary,
            {
                "on_part_begin": part_begin,
                "on_header_field": lambda d, s, e: header_data(field, d, s, e),
                "on_header_value": lambda d, s, e: header_data(value, d, s, e),
                "on_header_end": header_end,
                "on_headers_finished": headers_finished,
                "on_part_data": part_data,
                "on_end": end,
            },
        )
        try:
            async with asyncio.timeout(UPLOAD_SECONDS):
                stream = request.stream().__aiter__()
                while True:
                    try:
                        async with asyncio.timeout(30):
                            chunk = await anext(stream)
                    except StopAsyncIteration:
                        break
                    total += len(chunk)
                    if total > MAX_MEDIA_BYTES + MAX_ENVELOPE_BYTES:
                        raise HTTPException(
                            413, "Recording multipart request is too large"
                        )
                    for offset in range(0, len(chunk), CHUNK_BYTES):
                        parser.write(chunk[offset : offset + CHUNK_BYTES])
                        if total - size > MAX_ENVELOPE_BYTES + len(chunk):
                            raise HTTPException(
                                413, "Recording multipart overhead is too large"
                            )
                    if total - size > MAX_ENVELOPE_BYTES:
                        raise HTTPException(
                            413, "Recording multipart overhead is too large"
                        )
                parser.finalize()
        except TimeoutError as exc:
            raise HTTPException(
                408, "Recording upload timed out. Retry on a stable connection"
            ) from exc
        except MultipartParseError as exc:
            raise HTTPException(400, "Invalid recording multipart body") from exc
        if not complete or parts != 1 or not size:
            raise HTTPException(400, "Recording upload is empty or incomplete")
        target.flush()
        os.fsync(target.fileno())
    return filename, digest.hexdigest(), size


async def run_media_process(mode: str, path: Path, *arguments: str) -> bytes:
    """Intake and transcription share one decoder, not one decoder per caller."""
    root = Path(get_settings().upload_dir).resolve() / ".media-intake"
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (root / "decoder.lock").open("a+b") as lock:
        try:
            async with asyncio.timeout(PROCESS_SECONDS):
                while True:
                    try:
                        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        break
                    except BlockingIOError:
                        await asyncio.sleep(0.1)
        except TimeoutError:
            raise HTTPException(
                503, "Local audio decoder is busy; retry later"
            ) from None
        try:
            return await _run_media_process(mode, path, *arguments)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


async def _run_media_process(mode: str, path: Path, *arguments: str) -> bytes:
    """Own, limit, kill and reap the decoder even on cancellation/output overflow."""
    env = {
        k: os.environ[k] for k in ("PATH", "LD_LIBRARY_PATH", "LANG") if k in os.environ
    }
    spawning = asyncio.create_task(
        asyncio.create_subprocess_exec(
            sys.executable,
            str(Path(__file__).with_name("media_process.py")),
            mode,
            str(path.resolve()),
            str(os.getpid()),
            *arguments,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            start_new_session=True,
            limit=CHUNK_BYTES,
        )
    )
    cancelled = False
    while not spawning.done():
        try:
            await asyncio.shield(spawning)
        except asyncio.CancelledError:
            # Creation may already have forked. First obtain the owned handle,
            # then kill/reap it below before propagating cancellation.
            cancelled = True
    process = spawning.result()

    async def read_bounded(stream):
        result = bytearray()
        while chunk := await stream.read(4096):
            result.extend(chunk)
            if len(result) > PROCESS_OUTPUT_BYTES:
                raise HTTPException(
                    422,
                    "Recording validation produced excessive errors. Re-export the recording",
                )
        return bytes(result)

    readers = [
        asyncio.create_task(read_bounded(stream))
        for stream in (process.stdout, process.stderr)
    ]
    try:
        if cancelled:
            raise asyncio.CancelledError
        async with asyncio.timeout(30 if mode.startswith("probe") else PROCESS_SECONDS):
            stdout, stderr = await asyncio.gather(*readers)
            code = await process.wait()
        if code or stderr:
            raise HTTPException(
                422,
                "Recording is corrupt or unsupported. Re-export as MP3, M4A, WAV, MP4 or WebM with audio",
            )
        return stdout
    except TimeoutError as exc:
        raise HTTPException(
            422,
            "Recording validation timed out. Re-export with a supported audio codec and retry",
        ) from exc
    finally:
        if process.returncode is None:
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)

        # Shield cleanup from request cancellation. Do not release disk ownership
        # while the process or pipe readers still own the temporary recording.
        async def reap():
            await process.wait()
            for reader in readers:
                reader.cancel()
            await asyncio.gather(*readers, return_exceptions=True)

        cleanup = asyncio.create_task(reap())
        cleanup_cancelled = False
        while not cleanup.done():
            try:
                await asyncio.shield(cleanup)
            except asyncio.CancelledError:
                cleanup_cancelled = True
        cleanup.result()
        if cleanup_cancelled:
            raise asyncio.CancelledError


async def validate_recording(path: Path) -> ProbedMedia:
    try:
        probe = json.loads(await run_media_process("probe", path))
        streams = probe["streams"]
        audio = [s for s in streams if s["codec_type"] == "audio"]
        video = any(s["codec_type"] == "video" for s in streams)
        if not audio:
            raise HTTPException(
                422,
                "Recording has no audio track. Upload a recording containing speech",
            )
        # Container-only discovery never opens a video decoder. Audio-only
        # formats needing packet analysis use a strict audio decoder allowlist.
        if not video:
            probe = json.loads(await run_media_process("probe_audio", path))
            streams = probe["streams"]
            audio = [s for s in streams if s["codec_type"] == "audio"]
        durations = [float(s["duration"]) for s in streams if s.get("duration")]
        if probe["format"].get("duration"):
            durations.append(float(probe["format"]["duration"]))
        duration = max(durations)
        if not math.isfinite(duration) or not 0 < duration <= MAX_MEDIA_SECONDS:
            raise HTTPException(
                422,
                "Recording duration must be greater than zero and at most 7,200 seconds (two hours)",
            )
        if len(audio) > 8 or any(
            s["codec_name"] not in AUDIO_CODECS
            or not 1 <= int(s["channels"]) <= 8
            or not 8_000 <= int(s["sample_rate"]) <= 192_000
            for s in audio
        ):
            raise HTTPException(
                422,
                "Unsupported audio codec, track count, channel count or sample rate. Re-export as MP3, M4A or WAV",
            )
        video = any(s["codec_type"] == "video" for s in streams)
        format_name = probe["format"]["format_name"]
        extension = next(
            ext
            for name, ext in (
                ("mov", ".mp4" if video else ".m4a"),
                ("matroska", ".webm"),
                ("mp3", ".mp3"),
                ("wav", ".wav"),
                ("ogg", ".ogg"),
            )
            if name in format_name.split(",")
        )
    except (ValueError, KeyError, TypeError, StopIteration) as exc:
        raise HTTPException(
            422,
            "Cannot identify recording duration and audio. Re-export as MP3, M4A, WAV, MP4 or WebM",
        ) from exc
    # Check every audio track through EOF; never decode/extract video frames.
    # This is local decoder acceptance, NOT transcript coverage or speech quality.
    mode = "decode_mov" if extension in (".mp4", ".m4a") else "decode"
    progress = (await run_media_process(mode, path)).decode("ascii", errors="replace")
    times = [
        int(line.removeprefix("out_time_us="))
        for line in progress.splitlines()
        if line.startswith("out_time_us=")
        and line.removeprefix("out_time_us=").lstrip("-").isdigit()
    ]
    # A single decoded packet can have a zero progress timestamp.
    if (
        "progress=end" not in progress
        or not times
        or max(times) < 0
        or max(times) > MAX_MEDIA_SECONDS * 1_000_000
    ):
        raise HTTPException(
            422,
            "Decoded audio is empty or exceeds 7,200 seconds. Re-export within two hours",
        )
    return ProbedMedia("video" if video else "audio", extension, duration)
