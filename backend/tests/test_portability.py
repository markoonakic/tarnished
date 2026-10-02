"""Personal archive portability: profiles, report provenance and limits."""

import json
import zipfile
from copy import deepcopy

import pytest
from sqlalchemy import select

from app.models import Application, ApplicationStatus, Round, RoundType, User
from app.models.user_profile import UserProfile
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import import_payload_data


async def _owner(db, email, *, admin=False):
    from app.core.security import get_password_hash

    user = User(
        email=email, password_hash=get_password_hash("synthetic-pass"), is_admin=admin
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _status(db):
    row = await db.scalar(
        select(ApplicationStatus).where(ApplicationStatus.name == "Applied")
    )
    if row is None:
        row = ApplicationStatus(name="Applied", color="#8ec07c", is_default=True)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def _round_type(db):
    row = await db.scalar(select(RoundType).where(RoundType.name == "Phone Screen"))
    if row is None:
        row = RoundType(name="Phone Screen", is_default=True)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _export(db, user_id):
    return db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            user_id, session
        )
    )


async def test_empty_account_roundtrip_on_this_database(db):
    """An empty owner archive imports cleanly and creates a recipient profile."""
    owner = await _owner(db, "s11-empty-owner@example.com")
    recipient = await _owner(db, "s11-empty-recipient@example.com")
    archive = await _export(db, owner.id)
    assert archive["format_version"] == "2.0.0"
    assert archive["models"]["User"][0]["pipeline_report"] is None
    result = await import_payload_data(db, recipient.id, archive, {}, lambda **kw: None)
    await db.commit()
    assert result["applications"] == 0
    # An archive without a profile row does not fabricate one for the recipient.
    assert archive["models"].get("UserProfile", []) == []
    assert (
        await db.scalar(select(UserProfile).where(UserProfile.user_id == recipient.id))
        is None
    )


async def test_archive_excludes_credentials_and_foreign_state_after_s11_fields(db):
    """Adding report/profile fields must not introduce any secret or foreign leak."""
    owner = await _owner(db, "s11-exclusions-owner@example.com")
    other = await _owner(db, "s11-exclusions-other@example.com")
    status = await _status(db)
    owner.settings = {
        "theme": "dracula",
        "litellm_api_key": "legacy-ai-secret",
        "unknown": {"api_key": "nested-secret"},
    }
    db.add(
        UserProfile(
            user_id=owner.id,
            first_name="Owned",
            skills=["Python"],
            work_history=[{"company": "Owned Co", "title": "Engineer"}],
        )
    )
    db.add(
        Application(
            user_id=owner.id,
            company="Owned",
            job_title="Engineer",
            status_id=status.id,
            cv_path=None,
        )
    )
    db.add(
        Application(
            user_id=other.id,
            company="Foreign",
            job_title="Engineer",
            status_id=status.id,
        )
    )
    await db.commit()
    archive = await _export(db, owner.id)
    serialized = json.dumps(archive)
    for forbidden in (
        "password_hash",
        "session_version",
        "api_key",
        "key_hash",
        "legacy-ai-secret",
        "nested-secret",
        str(other.id),
        "Foreign",
        other.password_hash,
    ):
        assert forbidden not in serialized, forbidden
    assert archive["models"]["User"][0]["settings"]["theme"] == "dracula"
    assert len(archive["models"]["Application"]) == 1


async def test_profile_restores_coherently_without_account_authority(db):
    """The previously-skipped profile now restores; credentials never do."""
    owner = await _owner(db, "s11-profile-owner@example.com")
    recipient = await _owner(db, "s11-profile-recipient@example.com")
    db.add(
        UserProfile(
            user_id=owner.id,
            first_name="Ada",
            last_name="Lovelace",
            phone="+381601234567",
            location="Belgrade",
            authorized_to_work="EU Citizen",
            requires_sponsorship=False,
            work_history=[{"company": "Analytical", "title": "Engineer"}],
            education=[{"institution": "Synthetic University"}],
            skills=["Python", "SQL"],
        )
    )
    await db.commit()
    original = (
        recipient.password_hash,
        recipient.session_version,
        recipient.is_admin,
        recipient.email,
    )
    archive = await _export(db, owner.id)
    row = archive["models"]["UserProfile"][0]
    # Archived identity is not authority: the importer owns the target identity.
    row["user_id"] = owner.id
    row["id"] = owner.id
    row["__original_id__"] = owner.id
    await import_payload_data(db, recipient.id, archive, {}, lambda **kw: None)
    await db.commit()
    profile = await db.scalar(
        select(UserProfile).where(UserProfile.user_id == recipient.id)
    )
    assert profile.first_name == "Ada" and profile.skills == ["Python", "SQL"]
    assert profile.work_history == [{"company": "Analytical", "title": "Engineer"}]
    assert (
        recipient.password_hash,
        recipient.session_version,
        recipient.is_admin,
        recipient.email,
    ) == original


@pytest.mark.parametrize("legacy_profile", [False, True])
async def test_latest_reports_roundtrip_with_provenance_and_honest_staleness(
    db, legacy_profile
):
    """Pipeline and application reports round-trip as unverified stale evidence."""
    owner = await _owner(db, "s11-reports-owner@example.com")
    recipient = await _owner(db, "s11-reports-recipient@example.com")
    status = await _status(db)
    owner.pipeline_report = {
        "version": 1,
        "scope": "PIPELINE",
        "run_at": "2026-01-15T10:00:00+00:00",
        "provider": "openai",
        "model": "openai/synthetic",
        "config_revision": "config-rev-1",
        "fingerprint": "f" * 64,
        "required_scopes": [
            "analytics:read",
            "applications:read",
            "rounds:read",
            "files:read",
            "profile:read",
        ],
        "period": "30d",
        "as_of": "2026-01-15T10:00:00+00:00",
        "time_zone": "UTC",
        "findings": [],
        "sources": [],
        "coverage": {"sections": 1, "sources": 1, "characters": 1},
        "limitations": ["Synthetic"],
    }
    work_history = [
        {"company": "Example", "title": "Engineer", "email": "private@example.com"}
    ]
    db.add(UserProfile(user_id=owner.id, work_history=work_history))
    passage = json.dumps(
        work_history
        if legacy_profile
        else [{"company": "Example", "title": "Engineer"}]
    )
    source_id = "profile:work_history:0"
    owner.pipeline_report["sources"] = [
        {"id": source_id, "kind": "profile", "text": passage, "offset": 0}
    ]
    owner.pipeline_report["findings"] = [
        {
            "subject": "pipeline",
            "observation": "Recorded experience",
            "interpretation": "Review the record",
            "action": "Review experience",
            "limitations": "Applicant-supplied information",
            "citations": [{"source_id": source_id, "quote": passage}],
        }
    ]
    application = Application(
        user_id=owner.id,
        company="Reports",
        job_title="Engineer",
        status_id=status.id,
    )
    db.add(application)
    await db.flush()
    application.report = {
        "version": 1,
        "scope": "APPLICATION",
        "application_id": application.id,
        "run_at": "2026-01-15T10:00:00+00:00",
        "provider": "openai",
        "model": "openai/synthetic",
        "config_revision": "config-rev-1",
        "fingerprint": "a" * 64,
        "required_scopes": [
            "analytics:read",
            "applications:read",
            "rounds:read",
            "files:read",
            "profile:read",
        ],
        "findings": [],
        "sources": [],
        "coverage": {"sections": 1, "sources": 1, "characters": 1},
        "limitations": ["Synthetic"],
    }
    await db.commit()
    archive = await _export(db, owner.id)
    assert archive["models"]["User"][0]["pipeline_report"]["scope"] == "PIPELINE"
    assert archive["models"]["Application"][0]["report"]["scope"] == "APPLICATION"
    await import_payload_data(db, recipient.id, archive, {}, lambda **kw: None)
    await db.commit()
    restored_user = await db.get(User, recipient.id, populate_existing=True)
    assert restored_user.pipeline_report["scope"] == "PIPELINE"
    assert "unverified" in restored_user.pipeline_report_reason
    # Freshness proof is cleared so an imported report is never presented as current.
    assert restored_user.pipeline_report["fingerprint"] == ""
    assert restored_user.pipeline_report["config_revision"] == ""
    restored_app = await db.scalar(
        select(Application).where(
            Application.user_id == recipient.id, Application.company == "Reports"
        )
    )
    assert restored_app.report["scope"] == "APPLICATION"
    assert restored_app.report["application_id"] == restored_app.id
    assert restored_app.report["fingerprint"] == ""
    assert "unverified" in restored_app.report_reason


async def test_tampered_or_incompatible_archive_fails_without_mutation(db):
    """Checksum, version and unknown-field tampering fail clearly and preserve data."""
    owner = await _owner(db, "s11-tamper-owner@example.com")
    recipient = await _owner(db, "s11-tamper-recipient@example.com")
    status = await _status(db)
    db.add(
        Application(
            user_id=recipient.id,
            company="Recipient",
            job_title="Engineer",
            status_id=status.id,
        )
    )
    db.add(
        Application(
            user_id=owner.id,
            company="Owner",
            job_title="Engineer",
            status_id=status.id,
        )
    )
    await db.commit()
    archive = await _export(db, owner.id)
    before = await _export(db, recipient.id)

    for mutate in (
        lambda value: value.update(format_version="9.0.0"),
        lambda value: value["models"]["Application"][0].update(
            report={"scope": "INTERVIEW", "version": 1}
        ),
        lambda value: value["models"]["Application"][0].update(
            report={"version": 1, "scope": "APPLICATION", "sources": [{"id": "x"}]}
        ),
    ):
        bad = deepcopy(archive)
        mutate(bad)
        # Preflight validation is what guarantees no recipient mutation happens.
        from app.services.import_validation import validate_import_payload

        validation = await validate_import_payload(
            db, recipient.id, bad, {"file_count": 2}
        )
        assert validation.valid is False
        assert validation.errors
    after = await _export(db, recipient.id)
    assert after["models"] == before["models"]


async def test_missing_archive_member_fails_entry_path_remap(db):
    """A path with no archived member fails instead of silently dropping the file."""
    owner = await _owner(db, "s11-missing-owner@example.com")
    recipient = await _owner(db, "s11-missing-recipient@example.com")
    status = await _status(db)
    db.add(
        Application(
            user_id=owner.id,
            company="Owner",
            job_title="Engineer",
            status_id=status.id,
            cv_path="uploads/absent-in-archive.pdf",
        )
    )
    await db.commit()
    archive = await _export(db, owner.id)
    with pytest.raises(ValueError, match="Expected file not found"):
        await import_payload_data(db, recipient.id, archive, {}, lambda **kw: None)
    await db.rollback()


async def test_archive_limits_allow_maximum_recording_plus_metadata(
    tmp_path, monkeypatch
):
    """One maximum-supported recording plus other records must fit the envelope."""
    from app.api.utils import zip_utils

    # The real maximum recording (1,000,000,000 bytes) plus envelope must fit.
    assert zip_utils.MAX_ARCHIVE_MEMBER_BYTES == 1_000_000_000
    assert zip_utils.MAX_ARCHIVE_EXPANDED_BYTES >= 1_000_000_000 + 16_384

    # Verify the accepted boundary cheaply by scaling the contract down.
    monkeypatch.setattr(zip_utils, "MAX_ARCHIVE_MEMBER_BYTES", 1000)
    monkeypatch.setattr(zip_utils, "MAX_ARCHIVE_EXPANDED_BYTES", 2048)
    path = tmp_path / "at-limit.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr("data.json", "{}")
        archive.writestr("files/recording.bin", "r" * 1000)
        archive.writestr("files/other.txt", "metadata")
    info = await zip_utils.validate_zip_safety(str(path))
    assert info["is_safe"] is True
    assert info["total_uncompressed_size"] == 2 + 1000 + len("metadata")


async def test_archive_limits_reject_oversize_member(tmp_path, monkeypatch):
    from app.api.utils import zip_utils

    monkeypatch.setattr(zip_utils, "MAX_ARCHIVE_MEMBER_BYTES", 512)
    path = tmp_path / "oversize.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr("data.json", "{}")
        archive.writestr("files/huge.bin", "h" * 513)
    with pytest.raises(ValueError, match="member exceeds"):
        await zip_utils.validate_zip_safety(str(path))


async def test_archive_limits_reject_expanded_total(tmp_path, monkeypatch):
    from app.api.utils import zip_utils

    monkeypatch.setattr(zip_utils, "MAX_ARCHIVE_EXPANDED_BYTES", 1024)
    path = tmp_path / "expanded.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr("data.json", "{}")
        archive.writestr("files/a.txt", "a" * 600)
        archive.writestr("files/b.txt", "b" * 600)
    with pytest.raises(ValueError, match="total uncompressed size exceeds"):
        await zip_utils.validate_zip_safety(str(path))


async def test_archive_limits_reject_too_many_files(tmp_path, monkeypatch):
    from app.api.utils import zip_utils

    monkeypatch.setattr(zip_utils, "MAX_ARCHIVE_FILES", 2)
    path = tmp_path / "toomany.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as archive:
        for index in range(3):
            archive.writestr(f"files/{index}.txt", "x")
    with pytest.raises(ValueError, match="too many files"):
        await zip_utils.validate_zip_safety(str(path))


async def test_archived_staleness_reason_is_never_authority(db):
    """An archive cannot smuggle a 'fresh' claim; the importer sets the reason."""
    owner = await _owner(db, "s11-reason-owner@example.com")
    recipient = await _owner(db, "s11-reason-recipient@example.com")
    status = await _status(db)
    application = Application(
        user_id=owner.id, company="Reason", job_title="Engineer", status_id=status.id
    )
    db.add(application)
    await db.flush()
    application.report = {
        "version": 1,
        "scope": "APPLICATION",
        "application_id": application.id,
        "run_at": "2026-01-15T10:00:00+00:00",
        "provider": "openai",
        "model": "openai/synthetic",
        "config_revision": "config-rev-1",
        "fingerprint": "b" * 64,
        "required_scopes": [
            "analytics:read",
            "applications:read",
            "rounds:read",
            "files:read",
            "profile:read",
        ],
        "findings": [],
        "sources": [],
        "coverage": {"sections": 1, "sources": 1, "characters": 1},
        "limitations": ["Synthetic"],
    }
    application.report_reason = None
    await db.commit()
    archive = await _export(db, owner.id)
    archive["models"]["Application"][0]["report_reason"] = None
    await import_payload_data(db, recipient.id, archive, {}, lambda **kw: None)
    await db.commit()
    restored = await db.scalar(
        select(Application).where(
            Application.user_id == recipient.id, Application.company == "Reason"
        )
    )
    assert "unverified" in restored.report_reason


async def test_imported_round_and_media_identity_is_remapped(db):
    """Archived references are remapped to imported identities, never reused."""
    owner = await _owner(db, "s11-remap-owner@example.com")
    recipient = await _owner(db, "s11-remap-recipient@example.com")
    status = await _status(db)
    round_type = await _round_type(db)
    application = Application(
        user_id=owner.id, company="Remap", job_title="Engineer", status_id=status.id
    )
    db.add(application)
    await db.flush()
    round_row = Round(application_id=application.id, round_type_id=round_type.id)
    db.add(round_row)
    await db.commit()
    original_round_id = round_row.id
    archive = await _export(db, owner.id)
    await import_payload_data(db, recipient.id, archive, {}, lambda **kw: None)
    await db.commit()
    restored = await db.scalar(
        select(Round).join(Application).where(Application.user_id == recipient.id)
    )
    assert restored is not None
    assert restored.id != original_round_id
    assert restored.application_id != application.id


def _stable_export(archive):
    """Compare recipient content, not the volatile export timestamp.

    SQLite also drops tzinfo on re-read, so ISO datetimes are normalized before
    comparison; the DATA must be identical, which is what atomicity requires.
    """
    from datetime import datetime

    def normalize(value):
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return value
            if parsed.tzinfo is None:
                return parsed.isoformat()
            from datetime import UTC

            return parsed.astimezone(UTC).replace(tzinfo=None).isoformat()
        if isinstance(value, dict):
            return {
                k: normalize(v) for k, v in value.items() if k != "export_timestamp"
            }
        if isinstance(value, list):
            return [normalize(v) for v in value]
        return value

    return json.dumps(normalize(archive), sort_keys=True)


def _honest_report(scope, *, sources, application_id=None, period=None, as_of=None):
    """Build a valid report whose citations and source text come from real evidence."""
    cited = sources[:1]
    findings = [
        {
            "subject": "application" if scope == "APPLICATION" else "pipeline",
            "observation": "Observation from the supplied evidence.",
            "interpretation": "Interpreted, not a causal claim.",
            "action": "Take the recorded next step.",
            "limitations": "Bounded evidence only.",
            "citations": [
                {"source_id": s["id"], "quote": s["text"][:40]} for s in cited
            ],
        }
    ]
    report = {
        "version": 1,
        "scope": scope,
        "run_at": "2026-01-15T10:00:00+00:00",
        "provider": "openai",
        "model": "openai/synthetic",
        "config_revision": "config-rev-1",
        "fingerprint": "",
        "required_scopes": [
            "analytics:read",
            "applications:read",
            "rounds:read",
            "files:read",
            "profile:read",
        ],
        "findings": findings,
        "sources": [
            {"id": s["id"], "kind": s["kind"], "text": s["text"], "offset": s["offset"]}
            for s in cited
        ],
        "coverage": {"sections": 1, "sources": 1, "characters": 1},
        "limitations": ["Synthetic"],
    }
    if scope == "APPLICATION":
        report["application_id"] = application_id
    else:
        report["period"] = period or "all"
        report["as_of"] = as_of or "2026-01-15T10:00:00+00:00"
        report["time_zone"] = "UTC"
    return report


async def _seed_evidence(db, owner, status, round_type):
    from datetime import UTC, datetime

    application = Application(
        user_id=owner.id,
        company="Evidence",
        job_title="Engineer",
        status_id=status.id,
        applied_at=datetime(2026, 1, 1).date(),
    )
    db.add(application)
    await db.flush()
    round_row = Round(
        application_id=application.id,
        round_type_id=round_type.id,
        scheduled_at=datetime(2026, 1, 3, 9, 0, tzinfo=UTC),
        outcome="passed",
        notes_summary="Recorded round notes",
    )
    db.add(round_row)
    await db.flush()
    return application, round_row


async def test_fabricated_report_source_text_is_rejected_per_kind(db):
    """A tampered archive cannot smuggle invented evidence past validation.

    Shape-only checks admitted fabricated passage text for application, round,
    history and pipeline sources; the recipient UI renders that text as grounded
    evidence. Each kind must now be rejected while the honest archive still loads.
    """
    from datetime import UTC, datetime

    from app.models import ApplicationStatusHistory
    from app.services.interview_evidence import (
        application_evidence_sources,
        application_snapshot,
        pipeline_evidence_sources,
        pipeline_snapshot,
    )

    owner = await _owner(db, "s11-fabricate-owner@example.com")
    recipient = await _owner(db, "s11-fabricate-recipient@example.com")
    # Capture identities now: a rollback expires the ORM instances, and reading an
    # expired attribute outside the greenlet raises MissingGreenlet.
    owner_id, recipient_id = owner.id, recipient.id
    status = await _status(db)
    round_type = await _round_type(db)
    application, _round_row = await _seed_evidence(db, owner, status, round_type)
    db.add(
        ApplicationStatusHistory(
            application_id=application.id,
            to_status_id=status.id,
            changed_at=datetime(2026, 1, 2, 8, 30, tzinfo=UTC),
            note="Recorded history note",
            to_meaning="applied",
            time_provenance="recorded",
        )
    )
    await db.commit()

    data, _ = await application_snapshot(db, owner.id, application.id)
    app_sources, _ = await application_evidence_sources(data)
    pipe_data, _ = await pipeline_snapshot(
        db, owner.id, "all", datetime(2026, 1, 15, tzinfo=UTC), "UTC"
    )
    pipe_sources, _ = await pipeline_evidence_sources(pipe_data)

    # One honest report per scope, citing real evidence.
    kinds = {}
    for source in app_sources:
        kinds.setdefault(source["id"].split(":")[0], source)
    for head in ("application", "round", "history"):
        assert head in kinds, head
    application.report = _honest_report(
        "APPLICATION", sources=[kinds["application"]], application_id=application.id
    )
    owner.pipeline_report = _honest_report(
        "PIPELINE",
        sources=[pipe_sources[0]],
        period="all",
        as_of="2026-01-15T00:00:00+00:00",
    )
    await db.commit()

    honest = json.loads(json.dumps(await _export(db, owner_id)))
    await import_payload_data(db, recipient_id, honest, {}, lambda **kw: None)
    await db.rollback()

    # Fabricated application-scope source text must be rejected.
    for head in ("application", "round", "history"):
        bad = json.loads(json.dumps(honest))
        bad["models"]["Application"][0]["report"]["sources"][0]["text"] = (
            "FABRICATED " + head
        )
        bad["models"]["Application"][0]["report"]["findings"][0]["citations"][0][
            "quote"
        ] = "FABRICATED " + head
        with pytest.raises(ValueError):
            await import_payload_data(db, recipient_id, bad, {}, lambda **kw: None)
        await db.rollback()

    # Fabricated pipeline-scope source text must be rejected.
    bad = json.loads(json.dumps(honest))
    bad["models"]["User"][0]["pipeline_report"]["sources"][0]["text"] = "FABRICATED"
    bad["models"]["User"][0]["pipeline_report"]["findings"][0]["citations"][0][
        "quote"
    ] = "FABRICATED"
    with pytest.raises(ValueError):
        await import_payload_data(db, recipient_id, bad, {}, lambda **kw: None)
    await db.rollback()


async def test_fabricated_document_passage_is_rejected_without_a_document(db):
    """A cited cv/cover_letter must exist; an invented document passage is refused.

    The document text carve-out previously skipped any `document:*` source when no
    document was re-derived, so a fabricated cv passage was accepted for an
    application that has no cv at all.
    """
    owner = await _owner(db, "s11-doc-owner@example.com")
    recipient = await _owner(db, "s11-doc-recipient@example.com")
    owner_id, recipient_id = owner.id, recipient.id
    status = await _status(db)
    round_type = await _round_type(db)
    application, _round_row = await _seed_evidence(db, owner, status, round_type)
    await db.commit()

    application.report = _honest_report(
        "APPLICATION",
        sources=[
            {
                "id": f"document:{application.id}:cv:0",
                "kind": "cv",
                "text": "FABRICATED INVENTED CV PASSAGE",
                "offset": 0,
            }
        ],
        application_id=application.id,
    )
    await db.commit()

    honest = json.loads(json.dumps(await _export(db, owner_id)))
    # No cv exists on this application, so the fabricated passage must be refused.
    with pytest.raises(ValueError):
        await import_payload_data(db, recipient_id, honest, {}, lambda **kw: None)
    await db.rollback()


async def test_rejected_report_leaves_recipient_data_byte_identical(db):
    """A failed report verification must not commit any partial mutation."""
    from datetime import UTC, datetime

    from app.models import ApplicationStatusHistory
    from app.services.interview_evidence import (
        application_evidence_sources,
        application_snapshot,
    )

    owner = await _owner(db, "s11-atomic-owner@example.com")
    recipient = await _owner(db, "s11-atomic-recipient@example.com")
    owner_id, recipient_id = owner.id, recipient.id
    status = await _status(db)
    round_type = await _round_type(db)
    application, _round_row = await _seed_evidence(db, owner, status, round_type)
    db.add(
        ApplicationStatusHistory(
            application_id=application.id,
            to_status_id=status.id,
            changed_at=datetime(2026, 1, 2, 8, 30, tzinfo=UTC),
            note="Recorded history note",
            to_meaning="applied",
            time_provenance="recorded",
        )
    )
    recipient_application, _ = await _seed_evidence(db, recipient, status, round_type)
    recipient_round = Round(
        application_id=recipient_application.id,
        round_type_id=round_type.id,
        notes_summary="Recipient existing notes",
    )
    db.add(recipient_round)
    await db.commit()

    data, _ = await application_snapshot(db, owner.id, application.id)
    app_sources, _ = await application_evidence_sources(data)
    application.report = _honest_report(
        "APPLICATION", sources=[app_sources[0]], application_id=application.id
    )
    await db.commit()

    honest = json.loads(json.dumps(await _export(db, owner_id)))
    before = _stable_export(await _export(db, recipient_id))
    bad = json.loads(json.dumps(honest))
    bad["models"]["Application"][0]["report"]["sources"][0]["text"] = "FABRICATED"
    with pytest.raises(ValueError):
        await import_payload_data(db, recipient_id, bad, {}, lambda **kw: None)
    await db.rollback()
    after = _stable_export(await _export(db, recipient_id))
    assert after == before


async def test_export_refuses_missing_attachment_instead_of_partial_archive(
    db, tmp_path, monkeypatch
):
    """Missing or outside-root attachments fail the export without omitting files."""
    import json
    from pathlib import Path

    from app.api.utils.zip_utils import create_zip_export_file

    owner = await _owner(db, "s11-missingfile-owner@example.com")
    status = await _status(db)
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("foreign file outside the upload root")

    application = Application(
        user_id=owner.id,
        company="MissingFile",
        job_title="Engineer",
        status_id=status.id,
        cv_path=str(outside),
        cv_original_filename="cv.txt",
    )
    db.add(application)
    await db.commit()

    archive = await _export(db, owner.id)
    with pytest.raises(ValueError, match="missing or unavailable"):
        await create_zip_export_file(
            json.dumps(archive), owner.id, str(uploads), owner.email
        )

    # A genuinely absent path fails the same way.
    application.cv_path = str(uploads / "absent-from-disk.bin")
    await db.commit()
    archive = await _export(db, owner.id)
    with pytest.raises(ValueError, match="missing or unavailable"):
        await create_zip_export_file(
            json.dumps(archive), owner.id, str(uploads), owner.email
        )
    assert not list(Path(uploads).glob("*.zip"))
