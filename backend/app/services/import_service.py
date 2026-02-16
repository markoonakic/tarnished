"""Import service using introspective deserialization."""
from typing import Any
from sqlalchemy.orm import Session
from uuid import uuid4

from app.services.export_registry import ExportRegistry
from app.services.import_id_mapper import IDMapper


class ImportService:
    """
    Service for importing user data using model introspection.

    Handles ID remapping for foreign key relationships.
    """

    SUPPORTED_VERSION = "1.0"

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
        if "export_version" not in data:
            return False, "Missing export_version field"

        if data["export_version"] != self.SUPPORTED_VERSION:
            return False, (
                f"Unsupported export version: {data['export_version']}. "
                f"Expected {self.SUPPORTED_VERSION}"
            )

        if "models" not in data:
            return False, "Missing models field"

        if not isinstance(data["models"], dict):
            return False, "models field must be a dictionary"

        return True, None

    def import_user_data(
        self,
        export_data: dict[str, Any],
        user_id: str,
        session: Session,
        override: bool = False
    ) -> dict[str, int]:
        """
        Import user data from export dictionary.

        Args:
            export_data: Dictionary from export
            user_id: User ID to import for
            session: SQLAlchemy session
            override: If True, delete existing data first (not yet implemented)

        Returns:
            Dictionary with counts of imported records per model

        Raises:
            ValueError: If export_data fails validation
        """
        # Validate first
        is_valid, error = self.validate_export_data(export_data)
        if not is_valid:
            raise ValueError(f"Invalid export data: {error}")

        counts: dict[str, int] = {}

        # Process models in order (parents before children)
        for exportable_model in self.registry.get_models():
            model_class = exportable_model.model_class
            model_name = model_class.__name__

            if model_name not in export_data["models"]:
                continue

            records = export_data["models"][model_name]
            imported = 0

            for record_data in records:
                new_record = self._import_record(
                    model_class,
                    record_data,
                    user_id,
                    session
                )
                if new_record:
                    imported += 1

            counts[model_name] = imported

        return counts

    def _import_record(
        self,
        model_class: type,
        record_data: dict[str, Any],
        user_id: str,
        session: Session
    ) -> Any:
        """
        Import a single record.

        Args:
            model_class: SQLAlchemy model class
            record_data: Serialized record data
            user_id: User ID to associate with
            session: SQLAlchemy session

        Returns:
            Created model instance
        """
        # Get original ID for mapping
        original_id = record_data.get("__original_id__")

        # Generate new ID
        new_id = str(uuid4())

        # Build data for new record
        new_data: dict[str, Any] = {}

        for key, value in record_data.items():
            if key == "__original_id__":
                continue

            # Remap foreign keys if this looks like an FK field
            if key.endswith("_id") and key != "id":
                # Try to remap this FK
                ref_model = self._guess_referenced_model(key)
                if ref_model and value:
                    new_value = self.id_mapper.get(ref_model, value)
                    value = new_value if new_value else value

            new_data[key] = value

        # Set new ID
        new_data["id"] = new_id

        # Set user_id if model has it
        if hasattr(model_class, 'user_id'):
            new_data["user_id"] = user_id

        # Create instance
        instance = model_class(**new_data)
        session.add(instance)

        # Store mapping for future FK remapping
        if original_id:
            self.id_mapper.add(model_class.__name__, original_id, new_id)

        return instance

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
