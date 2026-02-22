"""Import service using introspective deserialization."""

from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import Date, DateTime, inspect, select
from sqlalchemy.orm import Mapper, Session

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

    def __init__(self, registry: ExportRegistry, id_mapper: IDMapper):
        """
        Initialize the import service.

        Args:
            registry: ExportRegistry containing registered models
            id_mapper: IDMapper for tracking old->new ID mappings
        """
        self.registry = registry
        self.id_mapper = id_mapper

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
            override: If True, delete existing data first (not yet implemented)
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

        counts: dict[str, int] = {}
        warnings: list[str] = []

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
                    try:
                        new_record = self._import_record(
                            model_class, record_data, user_id, session, file_mapping
                        )
                        if new_record:
                            imported += 1
                    except Exception as e:
                        # Log warning but continue with other records
                        warnings.append(f"Failed to import {model_name}: {str(e)}")

            counts[model_name] = imported

        # Validate FK integrity before commit
        fk_errors = self.validate_fk_integrity(export_data, user_id, session)
        if fk_errors:
            # Don't rollback here - let the outer async handler do it
            # (rollback in run_sync context can cause MissingGreenlet errors)
            error_detail = "; ".join(fk_errors[:3])
            if len(fk_errors) > 3:
                error_detail += f" (and {len(fk_errors) - 3} more)"
            raise ValueError(
                f"{ERROR_MESSAGES['fk_integrity']} Details: {error_detail}"
            )

        return {"counts": counts, "warnings": warnings}

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
            if key not in columns:
                continue

            # Remap file paths using file_mapping
            if key in self.FILE_PATH_FIELDS and value and file_mapping:
                # Try to find a matching path in the file mapping
                # The export stores paths like "uploads/abc123.pdf" in data.json
                # but file_mapping keys are ZIP paths like "applications/.../resume.pdf"
                # We need to find the mapping by checking if the value matches
                # what's in the export (which has the original CAS path)
                remapped = self._remap_file_path(value, file_mapping)
                if remapped:
                    value = remapped

            # Remap foreign keys if this looks like an FK field
            if key.endswith("_id") and key != "id":
                # Try to remap this FK
                ref_model = self._guess_referenced_model(key)
                if ref_model and value:
                    new_value = self.id_mapper.get(ref_model, value)
                    value = new_value if new_value else value

            # Deserialize value based on column type
            value = self._deserialize_value(value, columns[key])

            new_data[key] = value

        # Set new ID
        new_data["id"] = new_id

        # Set user_id if model has it
        if "user_id" in columns:
            new_data["user_id"] = user_id

        # Create instance
        instance = model_class(**new_data)
        session.add(instance)

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
        from app.models import ApplicationStatus

        status_name = status_data.get("name")
        original_id = status_data.get("__original_id__")

        # 1. Check for global status with this name (SQLAlchemy 2.0 style)
        stmt = select(ApplicationStatus).where(
            ApplicationStatus.user_id.is_(None),
            ApplicationStatus.name == status_name,
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
            ApplicationStatus.name == status_name,
        )
        existing_status = session.execute(stmt).scalar_one_or_none()
        if existing_status:
            if original_id:
                self.id_mapper.add("ApplicationStatus", original_id, existing_status.id)
            return existing_status

        # 3. Create new custom status
        columns = self._get_column_info(ApplicationStatus)
        new_data: dict[str, Any] = {"user_id": user_id}

        for key, value in status_data.items():
            if key in ("__original_id__", "id"):
                continue
            if key.startswith(self.RELATIONSHIP_PREFIX):
                continue
            if key not in columns:
                continue
            value = self._deserialize_value(value, columns[key])
            new_data[key] = value

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
        from app.models import RoundType

        type_name = round_type_data.get("name")
        original_id = round_type_data.get("__original_id__")

        # 1. Check for global round type with this name (SQLAlchemy 2.0 style)
        stmt = select(RoundType).where(
            RoundType.user_id.is_(None),
            RoundType.name == type_name,
        )
        global_type = session.execute(stmt).scalar_one_or_none()
        if global_type:
            if original_id:
                self.id_mapper.add("RoundType", original_id, global_type.id)
            return global_type

        # 2. Check for user's existing custom type (SQLAlchemy 2.0 style)
        stmt = select(RoundType).where(
            RoundType.user_id == user_id,
            RoundType.name == type_name,
        )
        existing_type = session.execute(stmt).scalar_one_or_none()
        if existing_type:
            if original_id:
                self.id_mapper.add("RoundType", original_id, existing_type.id)
            return existing_type

        # 3. Create new custom type
        columns = self._get_column_info(RoundType)
        new_data: dict[str, Any] = {"user_id": user_id}

        for key, value in round_type_data.items():
            if key in ("__original_id__", "id"):
                continue
            if key.startswith(self.RELATIONSHIP_PREFIX):
                continue
            if key not in columns:
                continue
            value = self._deserialize_value(value, columns[key])
            new_data[key] = value

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

        return errors
