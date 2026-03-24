"""Validation helpers for import payloads."""

import importlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, ApplicationStatus, RoundType
from app.services.export_registry import default_registry
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService

import_schemas = importlib.import_module("app.schemas.import")
ImportDataSchema = import_schemas.ImportDataSchema
ImportValidationResponse = import_schemas.ImportValidationResponse


def is_new_export_format(data: dict) -> bool:
    """Check if data uses the new introspective export format."""
    return "format_version" in data and "models" in data


def _count_custom(items: list[dict]) -> int:
    return sum(1 for item in items if item.get("user_id"))


async def _collect_new_format_warnings(
    db: AsyncSession, user_id: str, models: dict
) -> list[str]:
    warnings = []

    result = await db.execute(select(Application).where(Application.user_id == user_id))
    existing_count = len(result.scalars().all())
    if existing_count > 0:
        warnings.append(
            f"You have {existing_count} existing applications. Import will add to these unless you choose to override."
        )

    exported_statuses = {
        status["name"]
        for status in models.get("ApplicationStatus", [])
        if status.get("name")
    }

    existing_statuses_result = await db.execute(
        select(ApplicationStatus.name).where(
            (ApplicationStatus.user_id == user_id) | (ApplicationStatus.user_id == None)
        )
    )
    existing_status_names = {s[0] for s in existing_statuses_result.all()}

    missing_statuses = exported_statuses - existing_status_names
    if missing_statuses:
        status_list = list(missing_statuses)[:5]
        status_str = ", ".join(status_list)
        if len(missing_statuses) > 5:
            status_str += "..."
        warnings.append(
            f"Will create {len(missing_statuses)} new statuses: {status_str}"
        )

    exported_round_types = {
        round_type["name"]
        for round_type in models.get("RoundType", [])
        if round_type.get("name")
    }

    existing_round_types_result = await db.execute(
        select(RoundType.name).where(
            (RoundType.user_id == user_id) | (RoundType.user_id == None)
        )
    )
    existing_round_type_names = {rt[0] for rt in existing_round_types_result.all()}

    missing_round_types = exported_round_types - existing_round_type_names
    if missing_round_types:
        round_type_list = list(missing_round_types)[:5]
        round_type_str = ", ".join(round_type_list)
        if len(missing_round_types) > 5:
            round_type_str += "..."
        warnings.append(
            f"Will create {len(missing_round_types)} new round types: {round_type_str}"
        )

    return warnings


async def _validate_new_format_payload(
    db: AsyncSession,
    user_id: str,
    data: dict,
    zip_info: dict,
) -> ImportValidationResponse:
    id_mapper = IDMapper()
    import_service = ImportService(registry=default_registry, id_mapper=id_mapper)

    is_valid, error = import_service.validate_export_data(data)
    if not is_valid:
        return ImportValidationResponse(valid=False, summary={}, errors=[error])

    models = data.get("models", {})
    summary = {
        "applications": len(models.get("Application", [])),
        "rounds": len(models.get("Round", [])),
        "status_history": len(models.get("ApplicationStatusHistory", [])),
        "custom_statuses": _count_custom(models.get("ApplicationStatus", [])),
        "custom_round_types": _count_custom(models.get("RoundType", [])),
        "job_leads": len(models.get("JobLead", [])),
        "files": zip_info["file_count"] - 2,
    }
    warnings = await _collect_new_format_warnings(db, user_id, models)
    return ImportValidationResponse(valid=True, summary=summary, warnings=warnings)


async def _validate_legacy_payload(
    db: AsyncSession,
    user_id: str,
    data: dict,
    zip_info: dict,
) -> ImportValidationResponse:
    validated_data = ImportDataSchema(**data)

    result = await db.execute(select(Application).where(Application.user_id == user_id))
    existing_count = len(result.scalars().all())

    warnings = []
    if existing_count > 0:
        warnings.append(
            f"You have {existing_count} existing applications. Import will add to these unless you choose to override."
        )

    existing_statuses = await db.execute(
        select(ApplicationStatus.name).where(
            (ApplicationStatus.user_id == user_id) | (ApplicationStatus.user_id == None)
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
        status_str = ", ".join(status_list)
        if len(missing_statuses) > 5:
            status_str += "..."
        warnings.append(
            f"Will create {len(missing_statuses)} new statuses: {status_str}"
        )

    return ImportValidationResponse(
        valid=True,
        summary={
            "applications": len(validated_data.applications),
            "rounds": sum(len(app.rounds) for app in validated_data.applications),
            "status_history": sum(
                len(app.status_history) for app in validated_data.applications
            ),
            "custom_statuses": len(validated_data.custom_statuses),
            "custom_round_types": len(validated_data.custom_round_types),
            "files": zip_info["file_count"] - 1,
        },
        warnings=warnings,
    )


async def validate_import_payload(
    db: AsyncSession,
    user_id: str,
    data: dict,
    zip_info: dict,
) -> ImportValidationResponse:
    if is_new_export_format(data):
        return await _validate_new_format_payload(db, user_id, data, zip_info)
    return await _validate_legacy_payload(db, user_id, data, zip_info)
