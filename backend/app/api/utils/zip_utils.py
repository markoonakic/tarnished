import aiofiles
import asyncio
import json
import zipfile
from pathlib import Path
from typing import Dict, List
from fastapi import UploadFile

MAX_UNCOMPRESSED_SIZE = 2 * 1024 * 1024 * 1024  # 2GB
MAX_COMPRESSED_RATIO = 10


async def create_zip_export(
    json_data: str,
    user_id: str,
    base_upload_path: str
) -> bytes:
    """Create a ZIP file containing JSON data and all media files."""
    import tempfile
    import os

    # Parse JSON to get file paths
    data = json.loads(json_data)

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
                    if cv_path.exists():
                        file_paths.add((cv_path, f'files/applications/cv_{app["id"]}{cv_path.suffix}'))

                for round_data in app.get('rounds', []):
                    for media in round_data.get('media', []):
                        if media.get('path'):
                            media_path = Path(media['path'])
                            if media_path.exists():
                                file_paths.add((media_path, f'files/rounds/{round_data["id"]}_{media["type"]}{media_path.suffix}'))

            # Add files to ZIP
            for source_path, zip_name in file_paths:
                if source_path.exists():
                    zipf.write(source_path, zip_name)

        # Read ZIP file
        async with aiofiles.open(zip_path, 'rb') as f:
            zip_bytes = await f.read()

        return zip_bytes
