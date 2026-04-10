"""Execution helpers for import payloads."""

import hashlib
import importlib
import json
import zipfile
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import (
    Application,
    ApplicationStatus,
    ApplicationStatusHistory,
    JobLead,
    Round,
    RoundMedia,
    RoundType,
)
from app.services.export_registry import default_registry
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService
from app.services.import_validation import is_new_export_format
from app.services.reference_data import (
    find_user_round_type_by_name,
    find_user_status_by_name,
    find_visible_round_type_by_name,
    find_visible_status_by_name,
)

import_schemas = importlib.import_module("app.schemas.import")
ImportDataSchema = import_schemas.ImportDataSchema

UPLOAD_DIR = get_settings().upload_dir


def extract_files_from_zip(zip_path: str, user_id: str) -> dict[str, str]:
    user_upload_dir = Path(UPLOAD_DIR) / str(user_id)
    user_upload_dir.mkdir(parents=True, exist_ok=True)

    file_mapping = {}
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        for file_info in zip_ref.filelist:
            if file_info.filename.startswith("files/") and not file_info.is_dir():
                filename = Path(file_info.filename).name
                dest_path = user_upload_dir / filename

                counter = 1
                while dest_path.exists():
                    stem = Path(file_info.filename).stem
                    suffix = Path(file_info.filename).suffix
                    dest_path = user_upload_dir / f"{stem}_{counter}{suffix}"
                    counter += 1

                dest_path.write_bytes(zip_ref.read(file_info.filename))
                file_mapping[file_info.filename] = str(
                    dest_path.relative_to(Path(UPLOAD_DIR))
                )

    return file_mapping


def extract_files_from_new_format(zip_path: str, user_id: str) -> dict[str, str]:
    import hashlib as _hashlib

    from app.api.utils.zip_utils import (
        ALLOWED_DOCUMENT_TYPES,
        ALLOWED_MEDIA_TYPES,
        detect_extension,
        detect_mime_type,
    )

    user_upload_dir = Path(UPLOAD_DIR) / str(user_id)
    user_upload_dir.mkdir(parents=True, exist_ok=True)
    file_mapping: dict[str, str] = {}

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        try:
            manifest_json = zip_ref.read("manifest.json")
            manifest = json.loads(manifest_json)
            files_registry = manifest.get("files", {})
        except KeyError:
            files_registry = None

        try:
            data_json = zip_ref.read("data.json")
            export_data = json.loads(data_json)
        except KeyError:
            export_data = {}

        old_paths_in_data = set()
        models = export_data.get("models", {})
        for app in models.get("Application", []):
            if app.get("cv_path"):
                old_paths_in_data.add(app["cv_path"])
            if app.get("cover_letter_path"):
                old_paths_in_data.add(app["cover_letter_path"])
        for rnd in models.get("Round", []):
            if rnd.get("transcript_path"):
                old_paths_in_data.add(rnd["transcript_path"])
        for media in models.get("RoundMedia", []):
            if media.get("file_path"):
                old_paths_in_data.add(media["file_path"])

        if files_registry:
            for zip_path_str, file_info in files_registry.items():
                if zip_path_str in ("manifest.json", "data.json"):
                    continue
                content = zip_ref.read(zip_path_str)
                file_hash = _hashlib.sha256(content).hexdigest()
                expected_hash = file_info.get("sha256", "")
                if expected_hash and file_hash != expected_hash:
                    raise ValueError(
                        f"SHA256 checksum mismatch for {zip_path_str}: expected {expected_hash[:16]}..., got {file_hash[:16]}..."
                    )

                detected_mime = detect_mime_type(content)
                if detected_mime == "application/octet-stream":
                    detected_mime = file_info.get("mime_type", detected_mime)
                file_field = file_info.get("field", "")
                allowed_types = (
                    ALLOWED_DOCUMENT_TYPES
                    if file_field in ("cv_path", "cover_letter_path", "transcript_path")
                    else ALLOWED_DOCUMENT_TYPES | ALLOWED_MEDIA_TYPES
                )
                if detected_mime not in allowed_types:
                    raise ValueError(
                        f"Invalid MIME type for {zip_path_str}: {detected_mime}"
                    )

                ext = detect_extension(content)
                cas_filename = f"{file_hash}{ext}"
                cas_path = user_upload_dir / cas_filename
                if not cas_path.exists():
                    cas_path.write_bytes(content)
                new_cas_path = f"uploads/{user_upload_dir.name}/{cas_filename}"
                for old_path in old_paths_in_data:
                    if file_hash in old_path:
                        file_mapping[old_path] = new_cas_path
                        break

    return file_mapping


def extract_import_file_mapping(
    zip_path: str, user_id: str, data: dict
) -> dict[str, str]:
    if is_new_export_format(data):
        return extract_files_from_new_format(zip_path, user_id)
    return extract_files_from_zip(zip_path, user_id)


def _run_import_user_data(
    sync_session, export_data: dict, user_id: str, file_mapping: dict
) -> dict:
    id_mapper = IDMapper()
    import_service = ImportService(registry=default_registry, id_mapper=id_mapper)
    return import_service.import_user_data(
        export_data=export_data,
        user_id=user_id,
        session=sync_session,
        override=False,
        file_mapping=file_mapping,
    )


async def ensure_status_exists(
    db: AsyncSession, user_id: str, status_name: str
) -> ApplicationStatus:
    status = await find_visible_status_by_name(db, user_id, status_name)
    if not status:
        status = ApplicationStatus(
            user_id=user_id,
            name=status_name,
            color="#6B7280",
            is_default=False,
            order=999,
        )
        db.add(status)
        await db.flush()
    return status


async def ensure_round_type_exists(
    db: AsyncSession, user_id: str, type_name: str
) -> RoundType:
    round_type = await find_visible_round_type_by_name(db, user_id, type_name)
    if not round_type:
        round_type = RoundType(user_id=user_id, name=type_name, is_default=False)
        db.add(round_type)
        await db.flush()
    return round_type


async def import_applications(
    db: AsyncSession,
    user_id: str,
    applications_data: list,
    file_mapping: dict,
    progress_callback,
) -> dict:
    application_count = len(applications_data)
    imported_apps = []
    imported_rounds = 0
    imported_history = 0
    for idx, app_data in enumerate(applications_data):
        percent = int((idx / application_count) * 100) if application_count else 100
        progress_callback(
            stage="importing_applications",
            percent=percent,
            message=f"Importing application {idx + 1}/{application_count}",
        )
        status = await ensure_status_exists(db, user_id, app_data.status)
        applied_at = datetime.fromisoformat(
            app_data.applied_at.replace("Z", "+00:00")
        ).date()
        application = Application(
            user_id=user_id,
            company=app_data.company,
            job_title=app_data.job_title,
            job_description=app_data.job_description,
            job_url=app_data.job_url,
            status_id=status.id,
            cv_path=file_mapping.get(f"files/applications/cv_{app_data.id}.pdf")
            if app_data.cv_path
            else None,
            applied_at=applied_at,
        )
        db.add(application)
        await db.flush()
        imported_apps.append(application)
        for hist_data in app_data.status_history:
            from_status = (
                await ensure_status_exists(db, user_id, hist_data.from_status)
                if hist_data.from_status
                else None
            )
            to_status = await ensure_status_exists(db, user_id, hist_data.to_status)
            changed_at = datetime.fromisoformat(
                hist_data.changed_at.replace("Z", "+00:00")
            )
            db.add(
                ApplicationStatusHistory(
                    application_id=application.id,
                    from_status_id=from_status.id if from_status else None,
                    to_status_id=to_status.id,
                    changed_at=changed_at,
                    note=hist_data.note,
                )
            )
            imported_history += 1
        for round_data in app_data.rounds:
            round_type = await ensure_round_type_exists(db, user_id, round_data.type)
            scheduled_at = (
                datetime.fromisoformat(round_data.scheduled_at.replace("Z", "+00:00"))
                if round_data.scheduled_at
                else None
            )
            completed_at = (
                datetime.fromisoformat(round_data.completed_at.replace("Z", "+00:00"))
                if round_data.completed_at
                else None
            )
            round_obj = Round(
                application_id=application.id,
                round_type_id=round_type.id,
                scheduled_at=scheduled_at,
                completed_at=completed_at,
                outcome=round_data.outcome,
                notes_summary=round_data.notes_summary,
            )
            db.add(round_obj)
            await db.flush()
            imported_rounds += 1
            for media_data in round_data.media:
                media_path = file_mapping.get(media_data.path or "")
                if media_path:
                    db.add(
                        RoundMedia(
                            round_id=round_obj.id,
                            media_type=media_data.type,
                            file_path=media_path,
                        )
                    )
    return {
        "applications": len(imported_apps),
        "rounds": imported_rounds,
        "status_history": imported_history,
    }


async def clear_existing_import_data(db: AsyncSession, user_id: str) -> None:
    for model in (Application,):
        result = await db.execute(select(model).where(model.user_id == user_id))
        for row in result.scalars().all():
            await db.delete(row)
    result = await db.execute(select(JobLead).where(JobLead.user_id == user_id))
    for row in result.scalars().all():
        await db.delete(row)
    result = await db.execute(
        select(ApplicationStatus).where(ApplicationStatus.user_id == user_id)
    )
    for row in result.scalars().all():
        await db.delete(row)
    result = await db.execute(select(RoundType).where(RoundType.user_id == user_id))
    for row in result.scalars().all():
        await db.delete(row)
    await db.flush()


async def import_payload_data(
    db: AsyncSession, user_id: str, data: dict, file_mapping: dict, progress_callback
) -> dict:
    if is_new_export_format(data):
        result = await db.run_sync(_run_import_user_data, data, user_id, file_mapping)
        counts = result.get("counts", {})
        return {
            "applications": counts.get("Application", 0),
            "rounds": counts.get("Round", 0),
            "status_history": counts.get("ApplicationStatusHistory", 0),
            "statuses": counts.get("ApplicationStatus", 0),
            "round_types": counts.get("RoundType", 0),
            "media": counts.get("RoundMedia", 0),
            "warnings": result.get("warnings", []),
        }

    validated_data = ImportDataSchema(**data)
    for status_data in validated_data.custom_statuses:
        existing = await find_user_status_by_name(db, user_id, status_data.name)
        if existing is None:
            db.add(
                ApplicationStatus(
                    user_id=user_id,
                    name=status_data.name,
                    color=status_data.color or "#6B7280",
                    is_default=status_data.is_default,
                    order=status_data.order or 999,
                )
            )
    await db.flush()
    for type_data in validated_data.custom_round_types:
        existing = await find_user_round_type_by_name(db, user_id, type_data.name)
        if existing is None:
            db.add(
                RoundType(
                    user_id=user_id,
                    name=type_data.name,
                    is_default=type_data.is_default,
                )
            )
    await db.flush()
    return await import_applications(
        db, user_id, validated_data.applications, file_mapping, progress_callback
    )


def verify_new_format_manifest_checksum(
    data: dict, data_json: bytes, zip_ref: zipfile.ZipFile
) -> None:
    if not is_new_export_format(data):
        return
    try:
        manifest_json = zip_ref.read("manifest.json")
        manifest = json.loads(manifest_json)
        expected_checksum = manifest.get("checksums", {}).get("data.json", "")
        if expected_checksum:
            expected_hash = expected_checksum.replace("sha256:", "")
            actual_hash = hashlib.sha256(data_json).hexdigest()
            if actual_hash != expected_hash:
                raise ValueError(
                    f"data.json checksum mismatch: export may be corrupted. Expected {expected_hash[:16]}..., got {actual_hash[:16]}..."
                )
    except KeyError:
        return
