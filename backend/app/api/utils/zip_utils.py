import aiofiles
import json
import os
import tempfile
import zipfile
from pathlib import Path


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
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            file_list = zip_ref.infolist()
            file_count = len(file_list)

            # Check file count limit
            if file_count > MAX_FILE_COUNT:
                raise ValueError(f"ZIP contains too many files ({file_count} > {MAX_FILE_COUNT})")

            # Check each file for path traversal and size limits
            for file_info in file_list:
                # Check for path traversal attempts
                file_path = Path(file_info.filename)

                # Reject absolute paths
                if file_path.is_absolute():
                    raise ValueError(f"ZIP contains absolute path: {file_info.filename}")

                # Reject paths with .. components
                if ".." in file_path.parts:
                    raise ValueError(f"ZIP contains path traversal attempt: {file_info.filename}")

                # Check uncompressed size
                total_uncompressed_size += file_info.file_size
                if file_info.file_size > 100 * 1024 * 1024:  # 100MB per file limit
                    raise ValueError(f"ZIP contains file larger than 100MB: {file_info.filename}")

                # Check total size
                if total_uncompressed_size > MAX_UNCOMPRESSED_SIZE:
                    raise ValueError(f"ZIP total uncompressed size exceeds 1GB")

            # Check for ZIP bomb (compression ratio)
            if file_count > 0:
                zip_size = os.path.getsize(zip_path)
                if zip_size > 0 and total_uncompressed_size / zip_size > 100:
                    raise ValueError("ZIP has suspicious compression ratio (possible ZIP bomb)")

        return {
            "file_count": file_count,
            "is_safe": True,
            "total_uncompressed_size": total_uncompressed_size
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
    base_upload_path: str
) -> bytes:
    """Create a ZIP file containing JSON data and all media files."""
    # Parse JSON to get file paths
    data = json.loads(json_data)

    # Resolve the base upload path once
    base_path = Path(base_upload_path).resolve()

    # Create temp directory for ZIP
    with tempfile.TemporaryDirectory() as temp_dir:
        zip_path = os.path.join(temp_dir, 'export.zip')

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add data.json
            zipf.writestr('data.json', json_data)

            # Collect all file paths from applications and rounds
            file_paths = set()

            for app in data.get('applications', []):
                if app.get('cv_path'):
                    cv_path = Path(app['cv_path'])
                    # Validate path is safe before using it
                    if cv_path.exists() and is_path_safe(str(base_path), str(cv_path)):
                        file_paths.add((cv_path, f'files/applications/cv_{app["id"]}{cv_path.suffix}'))

                for round_data in app.get('rounds', []):
                    for media in round_data.get('media', []):
                        if media.get('path'):
                            media_path = Path(media['path'])
                            # Validate path is safe before using it
                            if media_path.exists() and is_path_safe(str(base_path), str(media_path)):
                                file_paths.add((media_path, f'files/rounds/{round_data["id"]}_{media["type"]}{media_path.suffix}'))

            # Add files to ZIP
            for source_path, zip_name in file_paths:
                if source_path.exists():
                    zipf.write(source_path, zip_name)

        # Read ZIP file
        async with aiofiles.open(zip_path, 'rb') as f:
            zip_bytes = await f.read()

        return zip_bytes
