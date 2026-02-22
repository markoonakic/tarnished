import hashlib
import json
import os
import re
import tempfile
import zipfile
from pathlib import Path

import aiofiles
import magic

# MIME type to extension mapping for CAS storage
MIME_TO_EXTENSION = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/rtf": ".rtf",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
}

# Allowed MIME types by category
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/markdown",
    "application/rtf",
}

ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg"}
ALLOWED_MEDIA_TYPES = ALLOWED_VIDEO_TYPES | ALLOWED_AUDIO_TYPES


def detect_extension(content: bytes) -> str:
    """Detect file extension from magic bytes.

    Args:
        content: Raw file bytes (first few KB sufficient)

    Returns:
        File extension including the dot (e.g., '.pdf')
    """
    mime_type = magic.from_buffer(content, mime=True)
    return MIME_TO_EXTENSION.get(mime_type, ".bin")


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for safe filesystem use.

    Removes path components, dangerous characters, and limits length.

    Args:
        filename: Original filename from user

    Returns:
        Sanitized filename safe for filesystem use
    """
    # Remove path components (prevent traversal)
    name = Path(filename).name

    # Replace dangerous characters
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)

    # Remove leading dots (hidden files)
    name = name.lstrip(".")

    # Limit length
    if len(name) > 200:
        stem = Path(name).stem[:190]
        suffix = Path(name).suffix
        name = f"{stem}{suffix}"

    # Ensure not empty
    if not name:
        name = "unnamed_file"

    return name


async def store_file(content: bytes, upload_dir: Path) -> str:
    """Store file with CAS naming, return relative path.

    Uses SHA-256 hash for filename to prevent collisions and enable deduplication.

    Args:
        content: Raw file bytes
        upload_dir: Directory to store the file in

    Returns:
        Relative path from project root (e.g., 'uploads/abc123...pdf')
    """
    file_hash = hashlib.sha256(content).hexdigest()
    ext = detect_extension(content)
    filename = f"{file_hash}{ext}"
    file_path = upload_dir / filename

    if not file_path.exists():
        file_path.write_bytes(content)

    return f"{upload_dir.name}/{filename}"


def validate_file(file_path: Path, allowed_types: set) -> tuple[bool, str]:
    """Validate file using magic bytes.

    Args:
        file_path: Path to the file to validate
        allowed_types: Set of allowed MIME types

    Returns:
        Tuple of (is_valid, detected_mime_type)
    """
    detected = magic.from_file(str(file_path), mime=True)
    return detected in allowed_types, detected


# --- Export Path Builders ---


def build_application_path(application: dict, filename: str) -> str:
    """Generate human-readable path for export.

    Args:
        application: Application dict with company, job_title, id fields
        filename: Name of the file to include in path

    Returns:
        Human-readable path like 'applications/Google - Software Engineer (a1b2c3d4)/resume.pdf'
    """
    company = sanitize_filename(application.get("company", "Unknown"))
    title = sanitize_filename(application.get("job_title", "Position"))
    short_id = str(application.get("id", "unknown"))[:8]

    return (
        f"applications/{company} - {title} ({short_id})/{sanitize_filename(filename)}"
    )


def build_round_media_path(
    application: dict,
    round_data: dict,
    round_index: int,
    media: dict,
) -> str:
    """Generate path for round media.

    Args:
        application: Parent application dict
        round_data: Round dict
        round_index: 0-based index of round in application's round list
        media: RoundMedia dict with file_path, original_filename

    Returns:
        Human-readable path for the media file
    """
    app_path = build_application_path(application, "").rstrip("/")
    round_order = f"{round_index + 1:02d}"  # 01, 02, etc.

    # Get round type name from nested data or default
    round_type_name = "Unknown"
    if "round_type" in round_data and round_data["round_type"]:
        round_type_name = round_data["round_type"].get("name", "Unknown")
    elif "round_type_id" in round_data:
        round_type_name = f"Round {round_index + 1}"

    round_name = sanitize_filename(round_type_name)

    # Use original_filename if available, otherwise derive from file_path
    if media.get("original_filename"):
        filename = sanitize_filename(media["original_filename"])
    else:
        filename = sanitize_filename(Path(media.get("file_path", "unknown")).name)

    return f"{app_path}/rounds/{round_order} - {round_name}/{filename}"


def build_transcript_path(application: dict, round_data: dict, round_index: int) -> str:
    """Generate path for round transcript.

    Args:
        application: Parent application dict
        round_data: Round dict
        round_index: 0-based index of round

    Returns:
        Human-readable path for the transcript file
    """
    app_path = build_application_path(application, "").rstrip("/")
    round_order = f"{round_index + 1:02d}"

    round_type_name = "Unknown"
    if "round_type" in round_data and round_data["round_type"]:
        round_type_name = round_data["round_type"].get("name", "Unknown")
    elif "round_type_id" in round_data:
        round_type_name = f"Round {round_index + 1}"

    round_name = sanitize_filename(round_type_name)

    # Determine extension from transcript_path
    transcript_path = round_data.get("transcript_path", "")
    ext = Path(transcript_path).suffix or ".pdf"

    return f"{app_path}/rounds/{round_order} - {round_name}/transcript{ext}"


def is_path_safe(base_path: str, file_path: str) -> bool:
    """Validate a file path is within the base directory to prevent path traversal."""
    try:
        # Resolve both paths
        base = Path(base_path).resolve()
        target = Path(file_path).resolve()

        # Check if target is within base directory
        try:
            target.relative_to(base)
        except ValueError:
            return False

        return True
    except Exception:
        return False


async def validate_zip_safety(zip_path: str) -> dict:
    """Validate ZIP file safety and return information about its contents.

    Args:
        zip_path: Path to the ZIP file to validate

    Returns:
        Dictionary with validation results including file_count and is_safe

    Raises:
        ValueError: If ZIP file is unsafe (path traversal, oversized, etc.)
    """
    MAX_FILE_COUNT = 1000
    MAX_UNCOMPRESSED_SIZE = 1024 * 1024 * 1024  # 1GB

    file_count = 0
    total_uncompressed_size = 0

    try:
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            file_list = zip_ref.infolist()
            file_count = len(file_list)

            # Check file count limit
            if file_count > MAX_FILE_COUNT:
                raise ValueError(
                    f"ZIP contains too many files ({file_count} > {MAX_FILE_COUNT})"
                )

            # Check each file for path traversal and size limits
            for file_info in file_list:
                # Check for path traversal attempts
                file_path = Path(file_info.filename)

                # Reject absolute paths
                if file_path.is_absolute():
                    raise ValueError(
                        f"ZIP contains absolute path: {file_info.filename}"
                    )

                # Reject paths with .. components
                if ".." in file_path.parts:
                    raise ValueError(
                        f"ZIP contains path traversal attempt: {file_info.filename}"
                    )

                # Check uncompressed size
                total_uncompressed_size += file_info.file_size
                if file_info.file_size > 100 * 1024 * 1024:  # 100MB per file limit
                    raise ValueError(
                        f"ZIP contains file larger than 100MB: {file_info.filename}"
                    )

                # Check total size
                if total_uncompressed_size > MAX_UNCOMPRESSED_SIZE:
                    raise ValueError("ZIP total uncompressed size exceeds 1GB")

            # Check for ZIP bomb (compression ratio)
            if file_count > 0:
                zip_size = os.path.getsize(zip_path)
                if zip_size > 0 and total_uncompressed_size / zip_size > 100:
                    raise ValueError(
                        "ZIP has suspicious compression ratio (possible ZIP bomb)"
                    )

        return {
            "file_count": file_count,
            "is_safe": True,
            "total_uncompressed_size": total_uncompressed_size,
        }
    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file")
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Error validating ZIP: {str(e)}")


async def create_zip_export(
    json_data: str,
    user_id: str,
    base_upload_path: str,
    user_email: str | None = None,
) -> bytes:
    """Create a ZIP file with manifest, data.json, and all media files.

    Args:
        json_data: JSON string of export data (from ExportService)
        user_id: User ID for manifest
        base_upload_path: Base directory for file storage
        user_email: Optional user email for manifest

    Returns:
        ZIP file as bytes
    """
    from datetime import UTC, datetime

    # Parse JSON to get file paths
    data = json.loads(json_data)

    # Resolve the base upload path once
    base_path = Path(base_upload_path).resolve()

    # Build file registry and mappings
    file_registry: dict[str, dict] = {}
    file_mappings: list[tuple[Path, str]] = []  # (source_path, zip_path)

    # Get models from the new format
    models = data.get("models", {})
    applications = models.get("Application", [])
    rounds = models.get("Round", [])
    round_media = models.get("RoundMedia", [])

    # Build lookup for rounds by application_id
    rounds_by_app: dict[str, list[dict]] = {}
    for rnd in rounds:
        app_id = rnd.get("application_id")
        if app_id:
            if app_id not in rounds_by_app:
                rounds_by_app[app_id] = []
            rounds_by_app[app_id].append(rnd)

    # Sort rounds by scheduled_at (earliest first), then created_at
    def sort_round_key(r: dict) -> tuple:
        scheduled = r.get("scheduled_at") or "9999-99-99"
        created = r.get("created_at") or ""
        return (scheduled, created)

    for app_id in rounds_by_app:
        rounds_by_app[app_id].sort(key=sort_round_key)

    # Build lookup for media by round_id
    media_by_round: dict[str, list[dict]] = {}
    for media in round_media:
        round_id = media.get("round_id")
        if round_id:
            if round_id not in media_by_round:
                media_by_round[round_id] = []
            media_by_round[round_id].append(media)

    # Process applications
    for app in applications:
        app_id = app.get("id")

        # CV file
        if app.get("cv_path"):
            cv_path = Path(app["cv_path"])
            if cv_path.exists() and is_path_safe(str(base_path), str(cv_path)):
                zip_path = build_application_path(app, "resume" + cv_path.suffix)
                file_mappings.append((cv_path, zip_path))

                content = cv_path.read_bytes()
                file_registry[zip_path] = {
                    "original_name": "resume" + cv_path.suffix,
                    "mime_type": magic.from_buffer(content, mime=True),
                    "size_bytes": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "entity_type": "Application",
                    "entity_id": app_id,
                    "field": "cv_path",
                }

        # Cover letter file
        if app.get("cover_letter_path"):
            cl_path = Path(app["cover_letter_path"])
            if cl_path.exists() and is_path_safe(str(base_path), str(cl_path)):
                zip_path = build_application_path(app, "cover_letter" + cl_path.suffix)
                file_mappings.append((cl_path, zip_path))

                content = cl_path.read_bytes()
                file_registry[zip_path] = {
                    "original_name": "cover_letter" + cl_path.suffix,
                    "mime_type": magic.from_buffer(content, mime=True),
                    "size_bytes": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "entity_type": "Application",
                    "entity_id": app_id,
                    "field": "cover_letter_path",
                }

        # Process rounds for this application
        app_rounds = rounds_by_app.get(app_id, [])
        for round_index, round_data in enumerate(app_rounds):
            round_id = round_data.get("id")
            if not round_id:
                continue

            # Transcript
            if round_data.get("transcript_path"):
                transcript_path = Path(round_data["transcript_path"])
                if transcript_path.exists() and is_path_safe(
                    str(base_path), str(transcript_path)
                ):
                    zip_path = build_transcript_path(app, round_data, round_index)
                    file_mappings.append((transcript_path, zip_path))

                    content = transcript_path.read_bytes()
                    file_registry[zip_path] = {
                        "original_name": "transcript" + transcript_path.suffix,
                        "mime_type": magic.from_buffer(content, mime=True),
                        "size_bytes": len(content),
                        "sha256": hashlib.sha256(content).hexdigest(),
                        "entity_type": "Round",
                        "entity_id": round_id,
                        "field": "transcript_path",
                    }

            # Round media
            for media in media_by_round.get(round_id, []):
                if media.get("file_path"):
                    media_path = Path(media["file_path"])
                    if media_path.exists() and is_path_safe(
                        str(base_path), str(media_path)
                    ):
                        zip_path = build_round_media_path(
                            app, round_data, round_index, media
                        )
                        file_mappings.append((media_path, zip_path))

                        content = media_path.read_bytes()
                        original_name = (
                            media.get("original_filename")
                            or Path(media["file_path"]).name
                        )
                        file_registry[zip_path] = {
                            "original_name": original_name,
                            "mime_type": magic.from_buffer(content, mime=True),
                            "size_bytes": len(content),
                            "sha256": hashlib.sha256(content).hexdigest(),
                            "entity_type": "RoundMedia",
                            "entity_id": media.get("id"),
                            "field": "file_path",
                        }

    # Build manifest
    export_timestamp = datetime.now(UTC).isoformat()
    manifest = {
        "format_version": "1.0.0",
        "source_system": "Tarnished",
        "export_timestamp": export_timestamp,
        "user_email": user_email,
        "user_id": user_id,
        "counts": {
            "applications": len(applications),
            "rounds": len(rounds),
            "round_media": len(round_media),
            "statuses": len(models.get("ApplicationStatus", [])),
            "round_types": len(models.get("RoundType", [])),
            "status_history": len(models.get("ApplicationStatusHistory", [])),
            "job_leads": len(models.get("JobLead", [])),
        },
        "checksums": {
            "data.json": "sha256:" + hashlib.sha256(json_data.encode()).hexdigest()
        },
        "files": file_registry,
    }

    # Create temp file for ZIP (streaming ZIPs are complex)
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            # Write manifest
            zipf.writestr("manifest.json", json.dumps(manifest, indent=2))

            # Write data
            zipf.writestr("data.json", json_data)

            # Write files with human-readable paths
            for source_path, zip_path in file_mappings:
                if source_path.exists():
                    zipf.write(source_path, zip_path)

        # Read ZIP file
        async with aiofiles.open(tmp_path, "rb") as f:
            zip_bytes = await f.read()

        return zip_bytes
    finally:
        # Cleanup temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
