"""Import validation and execution endpoints.

This module handles the validation and import of user data from ZIP files
containing JSON data and optional media files.
"""

import aiofiles
import asyncio
import io
import json
import os
import tempfile
import uuid
import zipfile
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    Round,
    RoundMedia,
    RoundType,
    User,
)
import importlib
import_schemas = importlib.import_module('app.schemas.import')
ImportDataSchema = import_schemas.ImportDataSchema
ImportValidationResponse = import_schemas.ImportValidationResponse
from app.api.utils.zip_utils import validate_zip_safety

router = APIRouter(prefix="/api/import", tags=["import"])
SECURE_TEMP_DIR = "/tmp/secure_imports"
os.makedirs(SECURE_TEMP_DIR, mode=0o700, exist_ok=True)
UPLOAD_DIR = os.getenv('UPLOAD_DIR', './uploads')


def create_secure_temp_file(original_filename: str) -> str:
    """Create secure temp file with proper permissions."""
    safe_filename = f"{uuid.uuid4()}_{original_filename}"
    temp_path = os.path.join(SECURE_TEMP_DIR, safe_filename)
    fd = os.open(temp_path, os.O_WRONLY | os.O_CREAT, 0o600)
    os.close(fd)
    return temp_path


def secure_delete(file_path: str):
    """Securely delete file by overwriting with random data."""
    try:
        with open(file_path, 'wb') as f:
            f.write(os.urandom(os.path.getsize(file_path)))
        os.remove(file_path)
    except Exception:
        try:
            os.remove(file_path)
        except Exception:
            pass


@router.post("/validate")
async def validate_import(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate an import ZIP file without importing data."""

    temp_path = None
    try:
        # Stream upload to disk
        temp_path = create_secure_temp_file(file.filename or 'import.zip')

        async with aiofiles.open(temp_path, 'wb') as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                await f.write(chunk)

        # Validate ZIP safety
        zip_info = await validate_zip_safety(temp_path)

        # Extract and validate data.json
        with zipfile.ZipFile(temp_path, 'r') as zip_ref:
            try:
                data_json = zip_ref.read('data.json')
            except KeyError:
                raise HTTPException(400, "ZIP must contain data.json")

            data = json.loads(data_json)

        # Validate with Pydantic
        validated_data = ImportDataSchema(**data)

        # Check for override warning
        result = await db.execute(
            select(Application)
            .where(Application.user_id == user.id)
        )
        existing_count = len(result.scalars().all())

        warnings = []
        if existing_count > 0:
            warnings.append(f"You have {existing_count} existing applications. Import will add to these unless you choose to override.")

        # Check for missing statuses/round types
        existing_statuses = await db.execute(
            select(ApplicationStatus.name)
            .where(
                (ApplicationStatus.user_id == user.id) |
                (ApplicationStatus.user_id == None)
            )
        )
        existing_status_names = {s[0] for s in existing_statuses.all()}

        needed_statuses = set()
        for app in validated_data.applications:
            needed_statuses.add(app.status)
            for hist in app.status_history:
                if hist.to_status:
                    needed_statuses.add(hist.to_status)
                if hist.from_status:
                    needed_statuses.add(hist.from_status)

        missing_statuses = needed_statuses - existing_status_names
        if missing_statuses:
            status_list = list(missing_statuses)[:5]
            status_str = ', '.join(status_list)
            if len(missing_statuses) > 5:
                status_str += '...'
            warnings.append(f"Will create {len(missing_statuses)} new statuses: {status_str}")

        return ImportValidationResponse(
            valid=True,
            summary={
                "applications": len(validated_data.applications),
                "rounds": sum(len(app.rounds) for app in validated_data.applications),
                "status_history": sum(len(app.status_history) for app in validated_data.applications),
                "custom_statuses": len(validated_data.custom_statuses),
                "custom_round_types": len(validated_data.custom_round_types),
                "files": zip_info["file_count"] - 1,  # -1 for data.json
            },
            warnings=warnings
        )

    except HTTPException:
        raise
    except Exception as e:
        return ImportValidationResponse(
            valid=False,
            summary={},
            errors=[str(e)]
        )
    finally:
        if temp_path and os.path.exists(temp_path):
            secure_delete(temp_path)
