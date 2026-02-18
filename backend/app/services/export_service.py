"""Export service using introspective serialization."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.services.export_registry import ExportRegistry
from app.services.export_serializer import serialize_model_instance


class ExportService:
    """
    Service for exporting user data using model introspection.

    Automatically serializes all fields and relationships for
    registered models.
    """

    EXPORT_VERSION = "1.0"

    def __init__(self, registry: ExportRegistry):
        self.registry = registry

    def export_user_data(
        self, user_id: str, session: Session, include_media_paths: bool = True
    ) -> dict[str, Any]:
        """
        Export all user data to a dictionary.

        Args:
            user_id: ID of the user whose data to export
            session: SQLAlchemy session
            include_media_paths: Whether to include file paths

        Returns:
            Dictionary with all user data ready for JSON serialization
        """
        result = {
            "export_version": self.EXPORT_VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "user": {"id": user_id},
            "models": {},
        }

        # Export each registered model in order
        for exportable_model in self.registry.get_models():
            model_class = exportable_model.model_class
            model_name = model_class.__name__

            records = self._get_user_records(model_class, user_id, session)

            serialized = [
                self._serialize_record(record, include_media_paths)
                for record in records
            ]

            result["models"][model_name] = serialized

        return result

    def _get_user_records(
        self, model_class: type, user_id: str, session: Session
    ) -> list:
        """Get all records for a model belonging to a user."""
        from app.models import Application

        # Check if model has user_id column
        if hasattr(model_class, "user_id"):
            return (
                session.query(model_class).filter(model_class.user_id == user_id).all()
            )

        # For User model itself
        if model_class.__name__ == "User":
            return session.query(model_class).filter(model_class.id == user_id).all()

        # For models without user_id (like UserProfile via relationship)
        if hasattr(model_class, "user"):
            return (
                session.query(model_class)
                .join(model_class.user)
                .filter(model_class.user.id == user_id)
                .all()
            )

        # For models linked via Application (Round, ApplicationStatusHistory)
        if hasattr(model_class, "application"):
            return (
                session.query(model_class)
                .join(Application, model_class.application_id == Application.id)
                .filter(Application.user_id == user_id)
                .all()
            )

        # For models linked via Round -> Application (RoundMedia)
        if hasattr(model_class, "round") and not hasattr(model_class, "application"):
            from app.models import Round

            return (
                session.query(model_class)
                .join(Round, model_class.round_id == Round.id)
                .join(Application, Round.application_id == Application.id)
                .filter(Application.user_id == user_id)
                .all()
            )

        return []

    def _serialize_record(
        self, record: Any, include_media_paths: bool
    ) -> dict[str, Any]:
        """
        Serialize a single record with all its relationships.

        Args:
            record: SQLAlchemy model instance
            include_media_paths: Whether to include file paths

        Returns:
            Serialized dictionary
        """
        # Get base serialization with relationships
        data = serialize_model_instance(
            record, include_relationships=True, relationship_prefix=""
        )

        # Handle None case (shouldn't happen for valid records)
        if data is None:
            return {}

        # Store original ID for import remapping
        if "id" in data:
            data["__original_id__"] = data["id"]

        return data
