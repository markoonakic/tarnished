"""Private decoder entry point: set Linux process limits before exec, never a shell."""

import ctypes
import os
import resource
import signal
import sys

# Executed as a file by media_intake, not imported by the API process.
if __name__ == "__main__":
    mode, path, owner_pid, *preparation = sys.argv[1:]
    # Linux parent-death ownership survives exec into FFmpeg. Close the race
    # where the API dies before this child has installed its parent-death signal.
    if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
        raise SystemExit(1)
    if os.getppid() != int(owner_pid):
        raise SystemExit(1)
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    output_limit = 20_000_000 if mode == "prepare_channel" else 0
    resource.setrlimit(resource.RLIMIT_FSIZE, (output_limit, output_limit))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if mode.startswith("document_"):
        if os.stat(path).st_size > 10_000_000:
            raise SystemExit(2)
        if mode == "document_pdfinfo":
            args = ["pdfinfo", path]
        elif mode == "document_pdf":
            page = int(preparation[0])
            if not 1 <= page <= 50:
                raise SystemExit(2)
            args = [
                "pdftotext",
                "-f",
                str(page),
                "-l",
                str(page),
                "-enc",
                "UTF-8",
                path,
                "-",
            ]
        elif mode == "document_docx":
            import zipfile

            import lxml.etree as etree

            with zipfile.ZipFile(path) as archive:
                members = archive.infolist()
                if len(members) > 200 or sum(m.file_size for m in members) > 8_000_000:
                    raise SystemExit(2)
                member = archive.getinfo("word/document.xml")
                if member.file_size > 2_000_000:
                    raise SystemExit(2)
                with archive.open(member) as stream:
                    content = stream.read(2_000_001)
                if (
                    len(content) > 2_000_000
                    or b"<!DOCTYPE" in content
                    or b"<!ENTITY" in content
                ):
                    raise SystemExit(2)
                root = etree.fromstring(
                    content,
                    etree.XMLParser(
                        resolve_entities=False, no_network=True, huge_tree=False
                    ),
                )
                text = "\n".join(root.xpath("//*[local-name()='t']/text()"))
                if len(text) > 32000:
                    raise SystemExit(2)
                sys.stdout.write(text)
            raise SystemExit(0)
        else:
            raise SystemExit(2)
        # Fixed Poppler argv; use the operator's PATH without a shell.
        os.execvp(args[0], args)  # nosec B606
    # Demuxers cannot open playlists, image sequences or remote protocols. MOV's
    # external data references remain disabled (including absolute local paths).
    common = [
        "-v",
        "error",
        "-threads",
        "1",
        "-max_alloc",
        "67108864",
        "-protocol_whitelist",
        "file",
        "-format_whitelist",
        "mov,matroska,webm,mp3,wav,ogg",
        "-probesize",
        "5000000",
        "-analyzeduration",
        "5000000",
    ]
    audio_codecs = "aac,mp3,mp3float,opus,vorbis,flac,alac,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le,pcm_u8"
    if mode in ("probe", "probe_audio"):
        args = [
            "ffprobe",
            *common,
            "-enable_drefs",
            "0",
            "-use_absolute_path",
            "0",
            *(
                ["-nofind_stream_info"]
                if mode == "probe"
                else ["-codec_whitelist", audio_codecs]
            ),
            "-show_entries",
            "format=format_name,duration,start_time:stream=index,codec_type,codec_name,sample_rate,channels,duration,start_time",
            "-of",
            "json",
            path,
        ]
    elif mode in ("decode", "decode_mov"):
        args = [
            "ffmpeg",
            "-nostdin",
            "-xerror",
            "-err_detect",
            "explode",
            *common,
            "-v",
            "fatal",
            "-discard:v",
            "all",
            "-codec_whitelist",
            audio_codecs,
            *(
                ["-f", "mov", "-enable_drefs", "0", "-use_absolute_path", "0"]
                if mode == "decode_mov"
                else []
            ),
            "-i",
            path,
            "-map",
            "0:a",
            "-vn",
            "-sn",
            "-dn",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-filter_complex_threads",
            "1",
            "-progress",
            "pipe:1",
            "-stats_period",
            "10",
            "-f",
            "null",
            "-",
        ]
    elif mode == "prepare_channel":
        destination, track, channel, origin, container = preparation
        track, channel = int(track), int(channel)
        origin = float(origin)
        if not (0 <= track < 8 and 0 <= channel < 8 and abs(origin) <= 1_000_000_000):
            raise SystemExit(2)
        args = [
            "ffmpeg",
            "-nostdin",
            "-xerror",
            "-err_detect",
            "explode",
            *common,
            "-v",
            "fatal",
            "-discard:v",
            "all",
            "-codec_whitelist",
            audio_codecs,
            *(
                ["-f", "mov", "-enable_drefs", "0", "-use_absolute_path", "0"]
                if container == "mov"
                else []
            ),
            # Keep the common container origin until asetpts removes it once.
            "-copyts",
            "-i",
            path,
            "-map",
            f"0:a:{track}",
            "-vn",
            "-sn",
            "-dn",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-filter_complex_threads",
            "1",
            "-af",
            f"pan=mono|c0=c{channel},asetpts=PTS-({origin})/TB,aresample=16000:async=1:first_pts=0",
            "-c:a",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            # Safety ceiling, not acceptance: reaching it is rejected by the
            # parent using actual sample counts. No silently clipped publication.
            "-t",
            "7200.1",
            "-f",
            "segment",
            "-segment_time",
            "600",
            "-reset_timestamps",
            "1",
            "-segment_format",
            "wav",
            os.path.join(destination, "%03d.wav"),
        ]
    else:
        raise SystemExit(2)
    # Fixed FFmpeg argv; use the operator's PATH without a shell.
    os.execvp(args[0], args)  # nosec B606
