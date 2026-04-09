"""Import service using introspective deserialization."""

from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import Date, DateTime, inspect, select
from sqlalchemy.orm import Mapper, Session

from app.core.reference_names import normalize_reference_name, normalized_reference_name
from app.models.round_type import RoundType
from app.models.status import ApplicationStatus
from app.services.export_registry import ExportRegistry
from app.services.import_id_mapper import IDMapper

# User-facing error messages
ERROR_MESSAGES = {
    "invalid_zip": "The file is not a valid ZIP archive.",
    "missing_manifest": "Export file is missing manifest.json. Please use a valid Tarnished export.",
    "missing_data": "Export file is missing data.json. Please use a valid Tarnished export.",
    "version_mismatch": "This export is from version {export_version}, which is not compatible with your current version ({current_version}).",
    "checksum_mismatch": "File integrity check failed. The export may be corrupted.",
    "path_traversal": "Security error: Invalid file path detected in export.",
    "zip_bomb": "Security error: Suspicious compression ratio detected.",
    "file_too_large": "A file in the export exceeds the maximum allowed size.",
    "missing_file": "Expected file not found in export: {filename}",
    "invalid_mime": "File type not allowed: {detected_type}",
    "fk_integrity": "Data integrity error: A reference could not be resolved.",
    "import_partial": "Import was partially completed but encountered errors. Please try again.",
    "invalid_format": "Invalid export format: {detail}",
}


class ImportService:
    """
    Service for importing user data using model introspection.

    Handles ID remapping for foreign key relationships.
    """

    SUPPORTED_VERSION = "1.0.0"
    RELATIONSHIP_PREFIX = "__rel__"
    DEFERRED_FOREIGN_KEY_FIELDS = {
        "Application": {"job_lead_id"},
        "JobLead": {"converted_to_application_id"},
    }
    LEGACY_COLUMN_ALIASES = {
        "Application": {
            "description": "job_description",
        }
    }

    def __init__(self, registry: ExportRegistry, id_mapper: IDMapper):
        """
        Initialize the import service.

        Args:
            registry: ExportRegistry containing registered models
            id_mapper: IDMapper for tracking old->new ID mappings
        """
        self.registry = registry
        self.id_mapper = id_mapper
        self._deferred_foreign_keys: list[tuple[str, str, str, str]] = []

    def validate_export_data(self, data: dict[str, Any]) -> tuple[bool, str | None]:
        """
        Validate export data structure.

        Args:
            data: The export data dictionary to validate

        Returns:
            Tuple of (is_valid, error_message). If valid, error_message is None.
        """
        if "format_version" not in data:
            return False, ERROR_MESSAGES["invalid_format"].format(
                detail="missing format_version field"
            )

        if data["format_version"] != self.SUPPORTED_VERSION:
            return False, ERROR_MESSAGES["version_mismatch"].format(
                export_version=data["format_version"],
                current_version=self.SUPPORTED_VERSION,
            )

        if "models" not in data:
            return False, ERROR_MESSAGES["invalid_format"].format(
                detail="missing models field"
            )

        if not isinstance(data["models"], dict):
            return False, ERROR_MESSAGES["invalid_format"].format(
                detail="models field must be a dictionary"
            )

        return True, None

    def import_user_data(
        self,
        export_data: dict[str, Any],
        user_id: str,
        session: Session,
        override: bool = False,
        file_mapping: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """
        Import user data from export dictionary.

        Args:
            export_data: Dictionary from export
            user_id: User ID to import for
            session: SQLAlchemy session
            override: Whether existing user data was cleared before import.
            file_mapping: Mapping from ZIP paths to CAS paths for file remapping

        Returns:
            Dictionary with counts of imported records per model and any warnings

        Raises:
            ValueError: If export_data fails validation or FK integrity check fails
        """
        # Validate first
        is_valid, error = self.validate_export_data(export_data)
        if not is_valid:
            raise ValueError(f"Invalid export data: {error}")

        self._deferred_foreign_keys = []
        counts: dict[str, int] = {}
        # Process models in order (parents before children)
        for exportable_model in self.registry.get_models():
            model_class = exportable_model.model_class
            model_name = model_class.__name__

            # Skip User model - we're importing for an existing user
            if model_name == "User":
                continue

            # Skip UserProfile - personal settings are not transferable
            if model_name == "UserProfile":
                continue

            if model_name not in export_data["models"]:
                continue

            records = export_data["models"][model_name]
            imported = 0

            # Use special handling for reference data (statuses, round types)
            if model_name == "ApplicationStatus":
                for record_data in records:
                    result = self._import_status(record_data, user_id, session)
                    if result:
                        imported += 1
            elif model_name == "RoundType":
                for record_data in records:
                    result = self._import_round_type(record_data, user_id, session)
                    if result:
                        imported += 1
            else:
                for record_data in records:
                    new_record = self._import_record(
                        model_class, record_data, user_id, session, file_mapping
                    )
                    if new_record:
                        imported += 1

            counts[model_name] = imported

        self._resolve_deferred_foreign_keys(session)

        fk_errors = self.validate_fk_integrity(export_data, user_id, session)
        if fk_errors:
            error_detail = "; ".join(fk_errors[:3])
            if len(fk_errors) > 3:
                error_detail += f" (and {len(fk_errors) - 3} more)"
            raise ValueError(
                f"{ERROR_MESSAGES['fk_integrity']} Details: {error_detail}"
            )

        return {"counts": counts, "warnings": []}

    def _get_column_info(self, model_class: type) -> dict[str, Any]:
        """
        Get column information for a model.

        Args:
            model_class: SQLAlchemy model class

        Returns:
            Dictionary mapping column names to column objects
        """
        mapper: Mapper = inspect(model_class)
        return {column.key: column for column in mapper.columns}

    def _deserialize_value(self, value: Any, column) -> Any:
        """
        Deserialize a value based on the column type.

        Args:
            value: The serialized value
            column: SQLAlchemy column object

        Returns:
            Deserialized value appropriate for the column type
        """
        if value is None:
            return None

        # Check for datetime types
        column_type = column.type
        if isinstance(column_type, DateTime):
            if isinstance(value, datetime):
                return value
            if isinstance(value, str):
                # Parse ISO format datetime string
                try:
                    # Handle strings with Z suffix
                    if value.endswith("Z"):
                        value = value[:-1] + "+00:00"
                    return datetime.fromisoformat(value)
                except ValueError:
                    pass
        elif isinstance(column_type, Date):
            if isinstance(value, date):
                return value
            if isinstance(value, str):
                # Parse ISO format date string
                try:
                    return date.fromisoformat(value)
                except ValueError:
                    pass

        return value

    # Fields that contain file paths needing remapping
    FILE_PATH_FIELDS = {"cv_path", "cover_letter_path", "transcript_path", "file_path"}

    def _should_defer_foreign_key(self, model_name: str, field_name: str) -> bool:
        return field_name in self.DEFERRED_FOREIGN_KEY_FIELDS.get(model_name, set())

    def _resolve_deferred_foreign_keys(self, session: Session) -> None:
        if not self._deferred_foreign_keys:
            return

        from app.models import Application, JobLead

        model_map = {
            "Application": Application,
            "JobLead": JobLead,
        }
        errors: list[str] = []

        for model_name, original_id, field_name, referenced_original_id in (
            self._deferred_foreign_keys
        ):
            model_class = model_map.get(model_name)
            referenced_model_name = self._guess_referenced_model(field_name)
            if model_class is None or referenced_model_name is None:
                errors.append(f"Unsupported deferred foreign key: {model_name}.{field_name}")
                continue

            imported_record_id = self.id_mapper.get(model_name, original_id)
            imported_reference_id = self.id_mapper.get(
                referenced_model_name, referenced_original_id
            )

            if not imported_record_id or not imported_reference_id:
                errors.append(
                    f"{model_name}.{field_name} references unresolved record: {referenced_original_id}"
                )
                continue

            imported_record = session.get(model_class, imported_record_id)
            if imported_record is None:
                errors.append(f"Imported {model_name} record not found: {original_id}")
                continue

            setattr(imported_record, field_name, imported_reference_id)

        if errors:
            error_detail = "; ".join(errors[:3])
            if len(errors) > 3:
                error_detail += f" (and {len(errors) - 3} more)"
            raise ValueError(f"{ERROR_MESSAGES['fk_integrity']} Details: {error_detail}")

        session.flush()

    def _import_record(
        self,
        model_class: type,
        record_data: dict[str, Any],
        user_id: str,
        session: Session,
        file_mapping: dict[str, str] | None = None,
    ) -> Any:
        """
        Import a single record.

        Args:
            model_class: SQLAlchemy model class
            record_data: Serialized record data
            user_id: User ID to associate with
            session: SQLAlchemy session
            file_mapping: Mapping from ZIP paths to CAS paths

        Returns:
            Created model instance
        """
        # Get original ID for mapping
        original_id = record_data.get("__original_id__")

        # Generate new ID
        new_id = str(uuid4())

        # Get column info for this model
        columns = self._get_column_info(model_class)

        # Build data for new record - only include valid column fields
        new_data: dict[str, Any] = {}

        for key, value in record_data.items():
            # Skip metadata fields
            if key == "__original_id__":
                continue

            # Skip relationship-prefixed fields (they're serialized separately)
            if key.startswith(self.RELATIONSHIP_PREFIX):
                continue

            # Only include fields that are actual columns on the model
            target_key = key
            alias_target = self.LEGACY_COLUMN_ALIASES.get(model_class.__name__, {}).get(
                key
            )
            if key not in columns:
                if alias_target is None:
                    continue
                canonical_value = record_data.get(alias_target)
                if alias_target not in columns or canonical_value not in (None, ""):
                    continue
                target_key = alias_target

            if target_key not in columns:
                continue

            if value and self._should_defer_foreign_key(model_class.__name__, target_key):
                if not original_id:
                    raise ValueError(
                        f"{ERROR_MESSAGES['fk_integrity']} Details: missing __original_id__ for deferred field {model_class.__name__}.{target_key}"
                    )
                self._deferred_foreign_keys.append(
                    (model_class.__name__, original_id, target_key, value)
                )
                continue

            # Remap file paths using file_mapping
            if target_key in self.FILE_PATH_FIELDS and value and file_mapping:
                # Try to find a matching path in the file mapping
                # The export stores paths like "uploads/abc123.pdf" in data.json
                # but file_mapping keys are ZIP paths like "applications/.../resume.pdf"
                # We need to find the mapping by checking if the value matches
                # what's in the export (which has the original CAS path)
                remapped = self._remap_file_path(value, file_mapping)
                if remapped:
                    value = remapped

            # Remap foreign keys if this looks like an FK field
            if target_key.endswith("_id") and target_key != "id":
                # Try to remap this FK
                ref_model = self._guess_referenced_model(target_key)
                if ref_model and value:
                    new_value = self.id_mapper.get(ref_model, value)
                    if new_value:
                        value = new_value

            # Deserialize value based on column type
            value = self._deserialize_value(value, columns[target_key])

            new_data[target_key] = value

        # Set new ID
        new_data["id"] = new_id

        # Set user_id if model has it
        if "user_id" in columns:
            new_data["user_id"] = user_id

        # Create instance
        instance = model_class(**new_data)
        session.add(instance)
        session.flush()  # Ensure we get the ID

        # Store mapping for future FK remapping
        if original_id:
            self.id_mapper.add(model_class.__name__, original_id, new_id)

        return instance

    def _remap_file_path(
        self, original_path: str, file_mapping: dict[str, str]
    ) -> str | None:
        """Remap a file path from export to new CAS path.

        The file_mapping is built by extract_files_from_new_format and maps
        old CAS paths (as stored in data.json) to new CAS paths.

        Args:
            original_path: The path as stored in the export data
            file_mapping: Mapping from old CAS paths to new CAS paths

        Returns:
            Remapped path, or None if no mapping found
        """
        if not original_path or not file_mapping:
            return None

        # Direct lookup
        if original_path in file_mapping:
            return file_mapping[original_path]

        # Try without leading "uploads/" if present
        if original_path.startswith("uploads/"):
            stripped = original_path[8:]  # Remove "uploads/"
            if stripped in file_mapping:
                return file_mapping[stripped]

        return None

    def _guess_referenced_model(self, fk_field: str) -> str | None:
        """
        Guess the model name a foreign key references.

        Converts field names like 'application_id' to 'Application',
        'user_id' to 'User', 'round_type_id' to 'RoundType'.

        Args:
            fk_field: The foreign key field name

        Returns:
            Guessed model name, or None if not an FK field pattern
        """
        # Special cases for FK fields that don't follow simple naming conventions
        if fk_field in ("status_id", "from_status_id", "to_status_id"):
            return "ApplicationStatus"
        if fk_field == "round_type_id":
            return "RoundType"
        if fk_field == "converted_to_application_id":
            return "Application"

        if fk_field.endswith("_id"):
            model_name = fk_field[:-3]  # Remove _id suffix
            # Convert snake_case to PascalCase
            parts = model_name.split("_")
            return "".join(p.capitalize() for p in parts)
        return None

    def _import_status(
        self,
        status_data: dict[str, Any],
        user_id: str,
        session: Session,
    ) -> Any:
        """
        Import an ApplicationStatus with merging by name.

        Lookup order:
        1. Global status (user_id=None) - system defaults
        2. User's existing custom status
        3. Create new custom status

        Args:
            status_data: Serialized status data
            user_id: User ID
            session: SQLAlchemy session

        Returns:
            Existing or created ApplicationStatus instance
        """
        status_name = normalize_reference_name(status_data.get("name") or "")
        original_id = status_data.get("__original_id__")

        # 1. Check for global status with this name (SQLAlchemy 2.0 style)
        stmt = select(ApplicationStatus).where(
            ApplicationStatus.user_id.is_(None),
            ApplicationStatus.normalized_name == normalized_reference_name(status_name),
        )
        global_status = session.execute(stmt).scalar_one_or_none()
        if global_status:
            # Map original ID to global status ID
            if original_id:
                self.id_mapper.add("ApplicationStatus", original_id, global_status.id)
            return global_status

        # 2. Check for user's existing custom status (SQLAlchemy 2.0 style)
        stmt = select(ApplicationStatus).where(
            ApplicationStatus.user_id == user_id,
            ApplicationStatus.normalized_name == normalized_reference_name(status_name),
        )
        existing_status = session.execute(stmt).scalar_one_or_none()
        if existing_status:
            if original_id:
                self.id_mapper.add("ApplicationStatus", original_id, existing_status.id)
            return existing_status

        # 3. Create new custom status
        columns = self._get_column_info(ApplicationStatus)
        new_data: dict[str, Any] = {}

        for key, value in status_data.items():
            if key in ("__original_id__", "id", "user_id"):  # Skip user_id - set below
                continue
            if key.startswith(self.RELATIONSHIP_PREFIX):
                continue
            if key not in columns:
                continue
            value = self._deserialize_value(value, columns[key])
            new_data[key] = value

        # Set user_id AFTER the loop (consistent with _import_record)
        new_data["user_id"] = user_id
        new_data["id"] = str(uuid4())
        instance = ApplicationStatus(**new_data)
        session.add(instance)
        session.flush()  # Get the ID

        if original_id:
            self.id_mapper.add("ApplicationStatus", original_id, new_data["id"])

        return instance

    def _import_round_type(
        self,
        round_type_data: dict[str, Any],
        user_id: str,
        session: Session,
    ) -> Any:
        """
        Import a RoundType with merging by name.

        Same lookup order as status: global → user's existing → create new.

        Args:
            round_type_data: Serialized round type data
            user_id: User ID
            session: SQLAlchemy session

        Returns:
            Existing or created RoundType instance
        """
        type_name = normalize_reference_name(round_type_data.get("name") or "")
        original_id = round_type_data.get("__original_id__")

        # 1. Check for global round type with this name (SQLAlchemy 2.0 style)
        stmt = select(RoundType).where(
            RoundType.user_id.is_(None),
            RoundType.normalized_name == normalized_reference_name(type_name),
        )
        global_type = session.execute(stmt).scalar_one_or_none()
        if global_type:
            if original_id:
                self.id_mapper.add("RoundType", original_id, global_type.id)
            return global_type

        # 2. Check for user's existing custom type (SQLAlchemy 2.0 style)
        stmt = select(RoundType).where(
            RoundType.user_id == user_id,
            RoundType.normalized_name == normalized_reference_name(type_name),
        )
        existing_type = session.execute(stmt).scalar_one_or_none()
        if existing_type:
            if original_id:
                self.id_mapper.add("RoundType", original_id, existing_type.id)
            return existing_type

        # 3. Create new custom type
        columns = self._get_column_info(RoundType)
        new_data: dict[str, Any] = {}

        for key, value in round_type_data.items():
            if key in ("__original_id__", "id", "user_id"):  # Skip user_id - set below
                continue
            if key.startswith(self.RELATIONSHIP_PREFIX):
                continue
            if key not in columns:
                continue
            value = self._deserialize_value(value, columns[key])
            new_data[key] = value

        # Set user_id AFTER the loop (consistent with _import_record)
        new_data["user_id"] = user_id
        new_data["id"] = str(uuid4())
        instance = RoundType(**new_data)
        session.add(instance)
        session.flush()

        if original_id:
            self.id_mapper.add("RoundType", original_id, new_data["id"])

        return instance

    def validate_fk_integrity(
        self,
        export_data: dict[str, Any],
        user_id: str,
        session: Session,
    ) -> list[str]:
        """
        Validate that all foreign keys in the export can be resolved.

        Args:
            export_data: The export data dictionary
            user_id: User ID
            session: SQLAlchemy session

        Returns:
            List of error messages (empty if all FKs are valid)
        """
        errors: list[str] = []
        models = export_data.get("models", {})

        # NOTE: We skip FK validation for ApplicationStatus and RoundType because
        # these are merged by name during import. If an export doesn't include global
        # statuses, the status_id won't be mapped, but _import_record will try to
        # remap it. If it still fails, the database FK constraint will catch it.
        # This allows old exports (without global statuses) to work.

        # Check Rounds for valid application_id (critical - must be mapped)
        for rnd in models.get("Round", []):
            app_id = rnd.get("application_id")
            if app_id:
                mapped_id = self.id_mapper.get("Application", app_id)
                if not mapped_id:
                    errors.append(
                        f"Round references non-existent application ID: {app_id}"
                    )

        # Check RoundMedia for valid round_id
        for media in models.get("RoundMedia", []):
            round_id = media.get("round_id")
            if round_id:
                mapped_id = self.id_mapper.get("Round", round_id)
                if not mapped_id:
                    errors.append(
                        f"RoundMedia references non-existent round ID: {round_id}"
                    )

        # Check ApplicationStatusHistory for valid references
        for history in models.get("ApplicationStatusHistory", []):
            app_id = history.get("application_id")
            if app_id:
                mapped_id = self.id_mapper.get("Application", app_id)
                if not mapped_id:
                    errors.append(
                        f"StatusHistory references non-existent application ID: {app_id}"
                    )

        for app in models.get("Application", []):
            job_lead_id = app.get("job_lead_id")
            if job_lead_id:
                mapped_id = self.id_mapper.get("JobLead", job_lead_id)
                if not mapped_id:
                    errors.append(
                        f"Application references non-existent job lead ID: {job_lead_id}"
                    )

        for lead in models.get("JobLead", []):
            application_id = lead.get("converted_to_application_id")
            if application_id:
                mapped_id = self.id_mapper.get("Application", application_id)
                if not mapped_id:
                    errors.append(
                        f"JobLead references non-existent application ID: {application_id}"
                    )

        return errors
