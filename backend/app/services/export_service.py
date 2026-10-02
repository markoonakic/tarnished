"""Owner-scoped export service using explicit personal-data fields."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.services.export_registry import ExportRegistry
from app.services.export_serializer import serialize_model_instance


class ExportService:
    """
    Export registered owner collections without traversing ORM back-references.
    """

    EXPORT_VERSION = "2.0.0"

    def __init__(self, registry: ExportRegistry):
        self.registry = registry

    def export_user_data(self, user_id: str, session: Session) -> dict[str, Any]:
        """
        Export all user data to a dictionary.

        Args:
            user_id: ID of the user whose data to export
            session: SQLAlchemy session

        Returns:
            Dictionary with all user data ready for JSON serialization
        """
        result = {
            "format_version": self.EXPORT_VERSION,
            "export_timestamp": datetime.now(UTC).isoformat(),
            "user": {"id": user_id},
            "models": {},
        }

        # Export each registered model in order
        for exportable_model in self.registry.get_models():
            model_class = exportable_model.model_class
            model_name = model_class.__name__

            records = self._get_user_records(model_class, user_id, session)

            serialized = [self._serialize_record(record) for record in records]

            result["models"][model_name] = serialized

        # ZIP path builders use this harmless label. Resolve it from the scoped
        # definitions, not a relationship that can lead back to foreign rounds.
        round_types = {
            item["id"]: item for item in result["models"].get("RoundType", [])
        }
        for round_data in result["models"].get("Round", []):
            round_data["round_type"] = round_types.get(round_data["round_type_id"])

        return result

    def _get_user_records(
        self, model_class: type, user_id: str, session: Session
    ) -> list:
        """Get all records for a model belonging to a user."""
        from app.models import Application

        # Applications and rounds can reference global definitions.
        if model_class.__name__ in ("ApplicationStatus", "RoundType"):
            return (
                session.query(model_class)
                .filter(
                    (model_class.user_id == user_id) | (model_class.user_id.is_(None))
                )
                .all()
            )

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

    def _serialize_record(self, record: Any) -> dict[str, Any]:
        """Serialize permitted fields and retain the original ID for remapping."""
        data = serialize_model_instance(record)

        # Handle None case (shouldn't happen for valid records)
        if data is None:
            return {}

        # Store original ID for import remapping
        if "id" in data:
            data["__original_id__"] = data["id"]

        return data
