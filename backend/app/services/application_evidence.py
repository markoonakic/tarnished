"""Transactional evidence helpers shared by application producers and corrections."""

from datetime import UTC, date, datetime

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, ApplicationStatus, ApplicationStatusHistory
from app.schemas.evidence import ResponseEvidenceInput
from app.services.ai_settings import lock_ai_settings
from app.services.interview_jobs import invalidate_interviews


def validate_response_date(evidence: ResponseEvidenceInput | None, today: date) -> None:
    if evidence and evidence.occurred_on is not None and evidence.occurred_on > today:
        raise HTTPException(422, "Response date cannot be in the future")


def response_values(
    evidence: ResponseEvidenceInput | None,
    today: date,
    application: Application | None = None,  # pyright: ignore[reportGeneralTypeIssues]
) -> dict:
    validate_response_date(evidence, today)
    if evidence is None:
        return {
            "response_state": "not_recorded",
            "response_occurred_on": None,
            "response_recorded_at": None,
            "response_reference": None,
        }
    existing = (
        application
        if application is not None and application.response_state == "recorded"
        else None
    )
    return {
        "response_state": "recorded",
        "response_occurred_on": existing.response_occurred_on
        if existing and "occurred_on" not in evidence.model_fields_set
        else evidence.occurred_on,
        "response_recorded_at": existing.response_recorded_at
        if existing
        else datetime.now(UTC),
        "response_reference": existing.response_reference
        if existing and "reference" not in evidence.model_fields_set
        else evidence.reference,
    }


def initial_evidence(
    application: Application,
    status: ApplicationStatus,
    *,
    applied_at_provided: bool = False,
) -> ApplicationStatusHistory:
    if status.meaning == "preparing" and not applied_at_provided:
        application.applied_at = None
    application.status_meaning = status.meaning
    application.status_meaning_provenance = "recorded"
    application.response_state = "not_recorded"
    return ApplicationStatusHistory(
        application_id=application.id,
        from_status_id=None,
        to_status_id=status.id,
        from_meaning=None,
        to_meaning=status.meaning,
        from_meaning_provenance="recorded",
        to_meaning_provenance="recorded",
        time_provenance="recorded",
    )


async def compare_and_set_application(
    db: AsyncSession,
    application: Application,
    values: dict,
    expected_revision: int | None = None,
) -> None:
    await lock_ai_settings(db)
    revision = application.evidence_revision
    if expected_revision is not None and expected_revision != revision:
        raise HTTPException(409, "Application changed; reload and retry")
    changed_id = await db.scalar(
        update(Application)
        .where(
            Application.id == application.id,
            Application.user_id == application.user_id,
            Application.status_id == application.status_id,
            Application.evidence_revision == revision,
        )
        .values(**values, evidence_revision=revision + 1)
        .returning(Application.id)
        .execution_options(synchronize_session=False)
    )
    if changed_id is None:
        raise HTTPException(409, "Application changed; reload and retry")
    from app.services.interview_evidence import APP_FIELDS

    relevant = {
        key: value
        for key, value in values.items()
        if key in APP_FIELDS and value != getattr(application, key)
    }
    if not values or relevant:
        await invalidate_interviews(
            db,
            application_id=application.id,
            removed=any(
                value is None
                or value == ""
                or value == []
                or (
                    isinstance(value, list)
                    and any(
                        item not in value for item in (getattr(application, key) or [])
                    )
                )
                for key, value in relevant.items()
            ),
        )


def erase_history_content(entry: ApplicationStatusHistory) -> None:
    # Retain only ID/parent and boundary time so equal surviving endpoints cannot
    # bridge a deleted observation. No hidden note, label, or corrected content.
    entry.is_gap = True
    entry.from_status_id = entry.to_status_id = None
    entry.from_meaning = entry.to_meaning = None
    entry.note = entry.correction_note = entry.reason = None
    entry.corrected_at = None
    entry.from_meaning_provenance = entry.to_meaning_provenance = "legacy_unknown"
    entry.time_provenance = "legacy_unknown"
