"""Import service using introspective deserialization."""

import math
import re
from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import Date, DateTime, inspect, select
from sqlalchemy.orm import Mapper, Session

from app.core.reference_names import normalize_reference_name, normalized_reference_name
from app.models.round_type import RoundType
from app.models.status import ApplicationStatus
from app.models.user import User
from app.schemas.evidence import (
    ApplicationEvidence,
    HistoryArchiveEvidence,
    HistoryEvidence,
    Meaning,
)
from app.schemas.job_lead import JobLeadCaptureArchive
from app.schemas.transcript import CurrentTranscript
from app.services.export_registry import ExportRegistry
from app.services.import_id_mapper import IDMapper

# User-facing error messages
ERROR_MESSAGES = {
    "version_mismatch": "This export is from version {export_version}, which is not compatible with your current version ({current_version}).",
    "missing_file": "Expected file not found in export: {filename}",
    "fk_integrity": "Data integrity error: A reference could not be resolved.",
    "invalid_format": "Invalid export format: {detail}",
}


class ImportService:
    """
    Service for importing user data using model introspection.

    Handles ID remapping for foreign key relationships.
    """

    SUPPORTED_VERSION = "2.0.0"
    # Imported reports are restored as evidence, never as fresh verified output.
    IMPORTED_REPORT_REASON = "Imported report is unverified and stale; explicitly rerun against restored sources"
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

    # Fields of the owner's own profile that this archive restores. Account and
    # credential state (id/user_id/password/session) is never transferable.
    PROFILE_RESTORE_FIELDS = (
        "first_name",
        "last_name",
        "email",
        "phone",
        "location",
        "linkedin_url",
        "authorized_to_work",
        "requires_sponsorship",
        "work_history",
        "education",
        "skills",
    )

    PROFILE_RESTORE_FIELDS += (
        "display_name",
        "desired_positions",
        "fields_of_work",
        "seniority",
        "work_modes",
        "employment_types",
        "years_experience",
        "location_restrictions",
        "skill_items",
        "technologies",
        "projects",
        "certificates",
        "languages",
    )

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

        if data["format_version"] not in ("1.0.0", self.SUPPORTED_VERSION):
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

        try:
            from app.services.interview_archive import validate_interview_archive

            validate_interview_archive(data["models"])
            from app.schemas.workspace import (
                CompanyCreate,
                ContactCreate,
                InterviewFields,
                JobFields,
                NoteCreate,
                ReminderCreate,
            )

            for model_name, schema in (
                ("Company", CompanyCreate),
                ("Contact", ContactCreate),
                ("Note", NoteCreate),
                ("Reminder", ReminderCreate),
                ("Round", InterviewFields),
                ("Application", JobFields),
                ("JobLead", JobFields),
            ):
                for record in data["models"].get(model_name, []):
                    schema.model_validate(
                        {
                            key: value
                            for key, value in record.items()
                            if key in schema.model_fields
                        }
                    )
            for row in data["models"].get("Round", []):
                if row.get("current_transcript") is not None:
                    try:
                        CurrentTranscript.model_validate(row["current_transcript"])
                    except ValidationError:
                        raise ValueError(
                            "Invalid normalized transcript metadata"
                        ) from None
                generation = row.get("transcript_generation", 0)
                if type(generation) is not int or generation < 0:
                    raise ValueError("Invalid transcript generation")
            for media in data["models"].get("RoundMedia", []):
                digest, size, duration = (
                    media.get(k)
                    for k in ("sha256", "byte_count", "probed_duration_seconds")
                )
                if any(v is not None for v in (digest, size, duration)) and (
                    not isinstance(digest, str)
                    or not re.fullmatch(r"[0-9a-f]{64}", digest)
                    or type(size) is not int
                    or not 0 < size <= 1_000_000_000
                    or type(duration) not in (int, float)
                    or not math.isfinite(duration)
                    or not 0 < duration <= 7200
                ):
                    raise ValueError("Invalid recording archive metadata")
                if media.get("validation") not in (
                    None,
                    "audio_decode_check",
                    "imported_unverified",
                ):
                    raise ValueError("Invalid recording archive validation state")
            for lead in data["models"].get("JobLead", []):
                JobLeadCaptureArchive.model_validate(lead)
            for name, fields in self.EVIDENCE_FIELDS.items():
                records = data["models"].get(name, [])
                if not isinstance(records, list) or any(
                    not isinstance(row, dict) for row in records
                ):
                    raise ValueError(f"{name} must contain record objects")
                for row in records:
                    if data["format_version"] == "1.0.0":
                        if fields.intersection(row):
                            raise ValueError(
                                "Evidence fields require format_version 2.0.0"
                            )
                    elif name == "Application":
                        ApplicationEvidence.model_validate(row)
                    elif name == "ApplicationStatusHistory":
                        HistoryArchiveEvidence.model_validate(row)
                    else:
                        TypeAdapter(Meaning).validate_python(row["meaning"])
        except (ValueError, KeyError, ValidationError) as exc:
            return False, ERROR_MESSAGES["invalid_format"].format(detail=str(exc))
        return True, None

    EVIDENCE_FIELDS = {
        "ApplicationStatus": {"meaning"},
        "Application": set(ApplicationEvidence.model_fields),
        "ApplicationStatusHistory": set(HistoryEvidence.model_fields),
    }

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
        self._interview_segment_ids = {}
        counts: dict[str, int] = {}
        # Process models in order (parents before children)
        for exportable_model in self.registry.get_models():
            model_class = exportable_model.model_class
            model_name = model_class.__name__

            # Restore only the language preference, never account authority.
            if model_name == "User":
                owner = session.get(User, user_id)
                for record in export_data["models"].get("User", []):
                    preferences = record.get("settings")
                    if (
                        isinstance(preferences, dict)
                        and preferences.get("language") in ("en", "sr-Latn")
                        and owner is not None
                    ):
                        owner.settings = {
                            **(owner.settings or {}),
                            "language": preferences["language"],
                        }
                continue

            # The owner's profile is personal data and restores with an explicit
            # allowlist; account/credential state is never transferable.
            if model_name == "UserProfile":
                imported = 0
                for record_data in export_data["models"].get(model_name, []):
                    if self._import_profile(record_data, user_id, session):
                        imported += 1
                if imported:
                    counts[model_name] = imported
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
        # JSON provenance is not a SQL FK: remap only to this archive's imported
        # media in the same round. Archives never restore jobs or actor authority.
        from app.models import Application, Round, RoundMedia

        for record in export_data["models"].get("Round", []):
            transcript = record.get("current_transcript")
            if not transcript or transcript.get("provenance") != "media":
                continue
            round = session.get(Round, self.id_mapper.get("Round", record["id"]))
            media_id = self.id_mapper.get("RoundMedia", transcript["source_media_id"])
            media = session.get(RoundMedia, media_id) if media_id else None
            if (
                round is None
                or round.current_transcript is None
                or media is None
                or media.round_id != round.id
                or media.sha256 != transcript["source_hash"]
            ):
                raise ValueError(
                    "Recording transcript source is missing or inconsistent"
                )
            round.current_transcript = {
                **round.current_transcript,
                "source_media_id": media.id,
                "coverage": "imported_audio",
            }
        from app.services.interview_archive import remap_report

        # Latest reports for every scope restore as unverified, stale evidence
        # (never authority). Report content is remapped to imported identities.
        for record in export_data["models"].get("Round", []):
            if record.get("interview_report") is not None:
                restored = session.get(Round, self.id_mapper.get("Round", record["id"]))
                if restored is None:
                    raise ValueError(ERROR_MESSAGES["fk_integrity"])
                restored.interview_report = remap_report(
                    record["interview_report"],
                    self.id_mapper,
                    self._interview_segment_ids,
                    original_round_id=record["id"],
                )
                restored.interview_report_reason = self.IMPORTED_REPORT_REASON
        for record in export_data["models"].get("Application", []):
            if record.get("report") is not None:
                restored_app = session.get(
                    Application, self.id_mapper.get("Application", record["id"])
                )
                if restored_app is None:
                    raise ValueError(ERROR_MESSAGES["fk_integrity"])
                restored_app.report = remap_report(
                    record["report"], self.id_mapper, self._interview_segment_ids
                )
                restored_app.report_reason = self.IMPORTED_REPORT_REASON
        for record in export_data["models"].get("User", []):
            if record.get("pipeline_report") is not None:
                restored_user = session.get(User, user_id)
                if restored_user is None:
                    raise ValueError(ERROR_MESSAGES["fk_integrity"])
                restored_user.pipeline_report = remap_report(
                    record["pipeline_report"],
                    self.id_mapper,
                    self._interview_segment_ids,
                )
                restored_user.pipeline_report_reason = self.IMPORTED_REPORT_REASON
        session.flush()

        fk_errors = self.validate_fk_integrity(export_data, user_id, session)
        if fk_errors:
            error_detail = "; ".join(fk_errors[:3])
            if len(fk_errors) > 3:
                error_detail += f" (and {len(fk_errors) - 3} more)"
            raise ValueError(
                f"{ERROR_MESSAGES['fk_integrity']} Details: {error_detail}"
            )

        return {"counts": counts, "warnings": []}

    def _import_profile(
        self,
        record_data: dict[str, Any],
        user_id: str,
        session: Session,
    ) -> Any:
        """Restore the owner's own profile from the explicit allowlist only.

        The imported archive is evidence, not authority: the importing owner's
        identity is used, never the archived id/user_id.
        """
        from app.models.user_profile import UserProfile

        profile = session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        ).scalar_one_or_none()
        if profile is None:
            profile = UserProfile(user_id=user_id)
            session.add(profile)
        for field in self.PROFILE_RESTORE_FIELDS:
            if field not in record_data:
                continue
            column = self._get_column_info(UserProfile).get(field)
            if column is None:
                continue
            profile.__setattr__(
                field, self._deserialize_value(record_data[field], column)
            )
        from app.services.profile_items import ITEM_FIELDS, SECTIONS, normalize_items

        for field in ITEM_FIELDS:
            setattr(profile, field, normalize_items(getattr(profile, field)))
        if not profile.skill_items and profile.skills:
            profile.skill_items = normalize_items(profile.skills)
        profile.skills = [
            item["name"]
            for item in profile.skill_items
            if isinstance(item.get("name"), str)
        ]
        profile.ai_permissions = dict.fromkeys(SECTIONS, False)
        profile.revision = (profile.revision or 0) + 1
        profile.permission_revision = (profile.permission_revision or 0) + 1
        session.flush()
        original_id = record_data.get("__original_id__")
        if original_id:
            self.id_mapper.add("UserProfile", original_id, profile.id)
        return profile

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

        for (
            model_name,
            original_id,
            field_name,
            referenced_original_id,
        ) in self._deferred_foreign_keys:
            model_class = model_map.get(model_name)
            referenced_model_name = self._guess_referenced_model(field_name)
            if model_class is None or referenced_model_name is None:
                errors.append(
                    f"Unsupported deferred foreign key: {model_name}.{field_name}"
                )
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
            raise ValueError(
                f"{ERROR_MESSAGES['fk_integrity']} Details: {error_detail}"
            )

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

            # Private new columns never become import authority through introspection.
            from app.services.export_serializer import EXPORT_FIELDS

            if (
                model_class.__name__ in EXPORT_FIELDS
                and key not in EXPORT_FIELDS[model_class.__name__]
                and key not in self.LEGACY_COLUMN_ALIASES.get(model_class.__name__, {})
            ):
                continue
            if model_class.__name__ == "Round" and key.startswith("interview_"):
                continue
            # Latest reports are restored only through the explicit remap path
            # below, never as raw archived JSON with un-remapped identities.
            if key in (
                "report",
                "report_reason",
                "pipeline_report",
                "pipeline_report_reason",
            ):
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

            if value and self._should_defer_foreign_key(
                model_class.__name__, target_key
            ):
                if not original_id:
                    raise ValueError(
                        f"{ERROR_MESSAGES['fk_integrity']} Details: missing __original_id__ for deferred field {model_class.__name__}.{target_key}"
                    )
                self._deferred_foreign_keys.append(
                    (model_class.__name__, original_id, target_key, value)
                )
                continue

            # Only files supplied by this import establish an attachment reference.
            # A path inside the shared upload root is not proof of ownership.
            if target_key in self.FILE_PATH_FIELDS and value:
                remapped = self._remap_file_path(value, file_mapping or {})
                if not remapped:
                    raise ValueError(
                        ERROR_MESSAGES["missing_file"].format(filename=value)
                    )
                value = remapped

            # Remap foreign keys if this looks like an FK field
            if target_key.endswith("_id") and target_key not in ("id", "intent_id"):
                # Try to remap this FK
                ref_model = self._guess_referenced_model(target_key)
                if ref_model and value:
                    new_value = self.id_mapper.get(ref_model, value)
                    if new_value:
                        value = new_value
                    elif ref_model in ("ApplicationStatus", "RoundType"):
                        reference_class = (
                            ApplicationStatus
                            if ref_model == "ApplicationStatus"
                            else RoundType
                        )
                        reference = session.get(reference_class, value)
                        if reference is None or reference.user_id not in (
                            None,
                            user_id,
                        ):
                            raise ValueError(
                                "Reference is not visible to importing owner"
                            )
                    elif target_key != "user_id":
                        raise ValueError("Reference must belong to this archive")

            # Deserialize value based on column type
            value = self._deserialize_value(value, columns[target_key])
            if target_key in {
                "due_at",
                "task_deadline",
                "scheduled_at",
                "completed_at",
                "created_at",
                "updated_at",
                "archived_at",
                "changed_at",
                "corrected_at",
                "response_recorded_at",
            } and isinstance(value, datetime):
                value = (
                    value.replace(tzinfo=UTC)
                    if value.tzinfo is None
                    else value.astimezone(UTC)
                )

            new_data[target_key] = value

        # Set new ID
        new_data["id"] = new_id

        # Set user_id if model has it
        if "user_id" in columns:
            new_data["user_id"] = user_id

        if model_class.__name__ == "JobLead":
            new_data.update(JobLeadCaptureArchive.model_validate(new_data).model_dump())
            # Imported state is evidence, never authority to run/publish work.
            new_data["processing_started_at"] = None
            if new_data.get("status") == "processing":
                new_data["status"] = "pending"
                new_data["error_message"] = (
                    "Imported interrupted processing. No work is running; explicit retry may repeat billed work."
                )

        if model_class.__name__ == "Round":
            transcript = new_data.get("current_transcript")
            if transcript is not None:
                transcript = CurrentTranscript.model_validate(transcript).model_dump()
                transcript["id"] = str(uuid4())
                transcript["revision"] = 1
                for segment in transcript["segments"]:
                    old_segment_id = segment["id"]
                    segment["id"] = str(uuid4())
                    if not hasattr(self, "_interview_segment_ids"):
                        self._interview_segment_ids = {}
                    self._interview_segment_ids[(original_id, old_segment_id)] = (
                        segment["id"]
                    )
                new_data["current_transcript"] = transcript
            new_data["transcript_generation"] = 1 if transcript else 0
            new_data["interview_generation"] = 0
            new_data["interview_report"] = None
            new_data["interview_report_reason"] = None

        if model_class.__name__ == "RoundMedia":
            # Archive claims are not a local decoder result. A later explicit
            # processing request must validate these bytes before dispatch.
            new_data["validation"] = "imported_unverified"

        if model_class.__name__ == "JobAnalysis":
            # Imported proposals are inert, never execution or permission authority.
            new_data["fingerprint"] = ""
            new_data["review_state"] = "imported"
            new_data["input_revisions"] = {}
        if model_class.__name__ == "Reminder":
            new_data["intent_id"] = str(uuid4())
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
        if fk_field == "lead_id":
            return "JobLead"
        if fk_field == "recruiter_contact_id":
            return "Contact"
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

        Reject owned-definition meaning conflicts before matching globals.
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
            (
                ApplicationStatus.builtin_key == status_data["builtin_key"]
                if status_data.get("builtin_key") and status_data.get("user_id") is None
                else ApplicationStatus.normalized_name
                == normalized_reference_name(status_name)
            ),
        )
        global_status = session.execute(stmt).scalar_one_or_none()
        global_matches = global_status is not None and (
            "meaning" not in status_data
            or global_status.meaning == status_data["meaning"]
        )

        # 2. Check owned conflicts even when a same-name global matches.
        stmt = select(ApplicationStatus).where(
            ApplicationStatus.user_id == user_id,
            ApplicationStatus.normalized_name == normalized_reference_name(status_name),
        )
        existing_status = session.execute(stmt).scalar_one_or_none()
        if (
            existing_status is not None
            and "meaning" in status_data
            and existing_status.meaning != status_data["meaning"]
            and (status_data.get("user_id") is not None or not global_matches)
        ):
            raise ValueError(f"Status meaning conflict: {status_name}")
        # Archived global references may still map to their matching global.
        if (
            global_matches
            and global_status is not None
            and (
                status_data.get("user_id") is None or global_status.builtin_key is None
            )
        ):
            if original_id:
                self.id_mapper.add("ApplicationStatus", original_id, global_status.id)
            return global_status
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
        new_data["is_default"] = False
        new_data["id"] = str(uuid4())
        new_data["builtin_key"] = None
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
            (
                RoundType.builtin_key == round_type_data["builtin_key"]
                if round_type_data.get("builtin_key")
                and round_type_data.get("user_id") is None
                else RoundType.normalized_name == normalized_reference_name(type_name)
            ),
        )
        global_type = session.execute(stmt).scalar_one_or_none()
        if global_type and (
            round_type_data.get("user_id") is None or global_type.builtin_key is None
        ):
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
        new_data["is_default"] = False
        new_data["builtin_key"] = None
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

        # Statuses and round types are merged by name before database FK checks.

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
