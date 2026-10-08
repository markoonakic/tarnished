"""Explicit fields for the version 2 personal-data export (never ORM backrefs)."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

# New model fields are private until deliberately added to this transfer format.
EXPORT_FIELDS: dict[str, tuple[str, ...]] = {
    "User": (
        "id",
        "email",
        "is_admin",
        "is_active",
        "created_at",
        "settings",
        "current_streak",
        "longest_streak",
        "total_activity_days",
        "last_activity_date",
        "ember_active",
        "streak_start_date",
        "streak_exhausted_at",
        "city",
        "country",
        # Latest pipeline-scope report and its freshness provenance. Not a
        # historical snapshot and never an execution authority. The generation
        # counter stays internal and is never exported or imported.
        "pipeline_report",
        "pipeline_report_reason",
    ),
    "UserProfile": (
        "id",
        "user_id",
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
    ),
    "ApplicationStatus": (
        "builtin_key",
        "id",
        "name",
        "normalized_name",
        "meaning",
        "color",
        "is_default",
        "user_id",
        "order",
    ),
    "RoundType": (
        "builtin_key",
        "id",
        "name",
        "normalized_name",
        "is_default",
        "user_id",
    ),
    "ApplicationStatusHistory": (
        "id",
        "application_id",
        "from_status_id",
        "to_status_id",
        "changed_at",
        "note",
        "from_meaning",
        "to_meaning",
        "from_meaning_provenance",
        "to_meaning_provenance",
        "time_provenance",
        "is_gap",
        "corrected_at",
        "correction_note",
    ),
    "Application": (
        "id",
        "user_id",
        "company",
        "job_title",
        "job_description",
        "job_url",
        "status_id",
        "status_meaning",
        "status_meaning_provenance",
        "evidence_revision",
        "report",
        "report_reason",
        "response_state",
        "response_occurred_on",
        "response_recorded_at",
        "response_reference",
        "cv_text",
        "cover_letter_text",
        "cv_path",
        "cv_original_filename",
        "cover_letter_path",
        "cover_letter_original_filename",
        "applied_at",
        "created_at",
        "updated_at",
        "job_lead_id",
        "location",
        "salary_min",
        "salary_max",
        "salary_currency",
        "recruiter_name",
        "recruiter_title",
        "recruiter_linkedin_url",
        "requirements_must_have",
        "requirements_nice_to_have",
        "skills",
        "years_experience_min",
        "years_experience_max",
        "source",
    ),
    "Round": (
        "id",
        "application_id",
        "round_type_id",
        "scheduled_at",
        "completed_at",
        "outcome",
        "notes_summary",
        "transcript_path",
        "transcript_original_filename",
        "transcript_summary",
        "transcript_generation",
        "media_generation",
        "current_transcript",
        "interview_report",
        "interview_report_reason",
        "created_at",
    ),
    "RoundMedia": (
        "id",
        "round_id",
        "file_path",
        "original_filename",
        "media_type",
        "sha256",
        "byte_count",
        "probed_duration_seconds",
        "validation",
        "uploaded_at",
    ),
    "JobLead": (
        "source_text",
        "source_truncated",
        "content_warning",
        "revision",
        "manual_fields",
        "id",
        "user_id",
        "status",
        "title",
        "company",
        "url",
        "description",
        "location",
        "salary_min",
        "salary_max",
        "salary_currency",
        "recruiter_name",
        "recruiter_title",
        "recruiter_linkedin_url",
        "requirements_must_have",
        "requirements_nice_to_have",
        "skills",
        "years_experience_min",
        "years_experience_max",
        "source",
        "posted_date",
        "scraped_at",
        "converted_to_application_id",
        "error_message",
    ),
}


EXPORT_FIELDS["Company"] = (
    "id",
    "user_id",
    "revision",
    "created_at",
    "updated_at",
    "name",
    "website",
    "industry",
    "location",
    "size",
    "description",
    "culture_notes",
)
EXPORT_FIELDS["Contact"] = (
    "id",
    "user_id",
    "revision",
    "created_at",
    "updated_at",
    "name",
    "function",
    "email",
    "phone",
    "profile_url",
    "role",
    "last_contact_on",
    "communication_note",
    "company_id",
)
EXPORT_FIELDS["Note"] = (
    "id",
    "user_id",
    "revision",
    "created_at",
    "updated_at",
    "lead_id",
    "application_id",
    "company_id",
    "contact_id",
    "round_id",
    "body",
)
EXPORT_FIELDS["Reminder"] = (
    "id",
    "user_id",
    "revision",
    "created_at",
    "updated_at",
    "lead_id",
    "application_id",
    "company_id",
    "contact_id",
    "round_id",
    "kind",
    "title",
    "note",
    "due_at",
    "time_zone",
    "state",
    "completed_at",
    "intent_id",
)
EXPORT_FIELDS["ApplicationContact"] = (
    "id",
    "user_id",
    "revision",
    "created_at",
    "updated_at",
    "application_id",
    "contact_id",
)
EXPORT_FIELDS["RoundContact"] = (
    "id",
    "user_id",
    "revision",
    "created_at",
    "updated_at",
    "round_id",
    "contact_id",
)
EXPORT_FIELDS["ApplicationDocument"] = (
    "id",
    "user_id",
    "revision",
    "created_at",
    "updated_at",
    "application_id",
    "kind",
    "file_path",
    "original_filename",
    "media_type",
    "byte_count",
    "sha256",
    "uploaded_at",
)
EXPORT_FIELDS["Application"] += (
    "company_id",
    "recruiter_contact_id",
    "work_mode",
    "employment_type",
    "seniority",
    "deadline",
    "pay_period",
    "priority",
    "tags",
    "confirmed_requirements",
    "requirements_revision",
    "archived_at",
    "outcome_reason",
    "source_text",
    "source_revision",
)
EXPORT_FIELDS["JobLead"] += (
    "company_id",
    "recruiter_contact_id",
    "work_mode",
    "employment_type",
    "seniority",
    "deadline",
    "pay_period",
    "priority",
    "tags",
    "confirmed_requirements",
    "requirements_revision",
    "decision",
    "updated_at",
)
EXPORT_FIELDS["Round"] += (
    "revision",
    "updated_at",
    "time_zone",
    "duration_minutes",
    "mode",
    "location",
    "meeting_url",
    "preparation",
    "questions_answers",
    "impressions",
    "task_description",
    "task_deadline",
    "next_steps",
    "expected_reply_on",
)
EXPORT_FIELDS["UserProfile"] += (
    "revision",
    "permission_revision",
    "ai_permissions",
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
EXPORT_FIELDS["ApplicationStatusHistory"] += ("reason",)
EXPORT_FIELDS["User"] += ("approval_pending", "last_login_at")

# User.settings may retain legacy credentials and unknown internal state.
EXPORT_SETTINGS_FIELDS = (
    "language",
    "theme",
    "accent",
    "show_streak_stats",
    "show_needs_attention",
    "show_heatmap",
    "time_zone_mode",
    "time_zone",
)


def serialize_value(value: Any) -> Any:
    """
    Serialize a single value to JSON-compatible format.

    Args:
        value: Any value to serialize

    Returns:
        JSON-compatible representation of the value:
        - None -> None
        - Primitives (str, int, float, bool) -> as-is
        - datetime/date -> ISO string
        - UUID -> string
        - Decimal -> float
        - list/dict -> as-is
        - Other types -> str()
    """
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (list, dict)):
        return value
    # Fallback to string representation
    return str(value)


def serialize_model_instance(instance: Any) -> dict[str, Any] | None:
    """Serialize permitted columns only; collections are scoped by ExportService."""
    if instance is None:
        return None
    model_name = instance.__class__.__name__
    if model_name not in EXPORT_FIELDS:
        raise ValueError(f"Model is not permitted in personal exports: {model_name}")
    result = {
        field: serialize_value(getattr(instance, field))
        for field in EXPORT_FIELDS[model_name]
    }
    for field in (
        "response_recorded_at",
        "corrected_at",
        "changed_at",
        "due_at",
        "task_deadline",
        "archived_at",
        "last_login_at",
    ):
        if field in result and (value := getattr(instance, field)) is not None:
            # SQLite drops the timezone of our UTC-normalized evidence writes.
            result[field] = (
                value.replace(tzinfo=UTC)
                if value.tzinfo is None
                else value.astimezone(UTC)
            ).isoformat()
    if model_name == "User" and instance.settings is not None:
        settings = instance.settings if isinstance(instance.settings, dict) else {}
        result["settings"] = {
            key: value
            for key in EXPORT_SETTINGS_FIELDS
            if key in settings
            and isinstance(value := settings[key], (str, bool, type(None)))
        }
    return result
