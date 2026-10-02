"""Evidence-bearing scoped archive validation and transactional round trips."""

from copy import deepcopy
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.models import Application, ApplicationStatus, ApplicationStatusHistory, User
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_execution import import_payload_data
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService


@pytest.fixture
async def evidence_archive(db):
    owner = User(
        email="archive-evidence@synthetic.test",
        password_hash="SECRET-EXCLUDED",
        settings={"api_key": "SECRET-EXCLUDED", "theme": "dark"},
    )
    target = User(email="archive-target@synthetic.test", password_hash="unused")
    db.add_all([owner, target])
    await db.flush()
    status = ApplicationStatus(name="Own meaning", meaning="offer", user_id=owner.id)
    db.add(status)
    await db.flush()
    application = Application(
        user_id=owner.id,
        company="Synthetic",
        job_title="Role",
        status_id=status.id,
        status_meaning="interviewing",
        status_meaning_provenance="recorded",
        response_state="recorded",
        response_recorded_at=datetime.now(UTC),
        response_reference="optional reference",
    )
    db.add(application)
    await db.flush()
    db.add_all(
        [
            ApplicationStatusHistory(
                application_id=application.id,
                to_status_id=status.id,
                to_meaning="interviewing",
                to_meaning_provenance="recorded",
                time_provenance="legacy_unknown",
                corrected_at=datetime.now(UTC),
                correction_note="Correction only of meaning",
            ),
            ApplicationStatusHistory(application_id=application.id, is_gap=True),
        ]
    )
    await db.commit()
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            owner.id, session
        )
    )
    return owner, target, archive


async def test_archive_preserves_snapshots_response_partial_correction_and_gap(
    db, evidence_archive
):
    owner, target, archive = evidence_archive
    import json

    assert archive["format_version"] == "2.0.0"
    assert "SECRET-EXCLUDED" not in json.dumps(archive)
    assert len(archive["models"]["Application"]) == 1
    result = await import_payload_data(
        db, target.id, archive, {}, lambda **kwargs: None
    )
    await db.commit()
    assert result["applications"] == 1 and result["status_history"] == 2
    exported = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            target.id, session
        )
    )
    for model in ["Application", "ApplicationStatusHistory"]:
        fields = ImportService.EVIDENCE_FIELDS[model]
        assert [{k: row[k] for k in fields} for row in archive["models"][model]] == [
            {k: row[k] for k in fields} for row in exported["models"][model]
        ]
    assert (
        archive["models"]["Application"][0]["id"]
        != exported["models"]["Application"][0]["id"]
    )
    assert exported["models"]["ApplicationStatus"][0]["meaning"] == "offer"


async def test_archive_semantic_conflict_and_foreign_reference_rollback(
    db, evidence_archive
):
    owner, target, archive = evidence_archive
    conflict = ApplicationStatus(
        name="Own meaning", meaning="rejected", user_id=target.id
    )
    db.add(conflict)
    await db.commit()
    with pytest.raises(ValueError, match="meaning conflict"):
        async with db.begin_nested():
            await import_payload_data(db, target.id, archive, {}, lambda **kwargs: None)
    assert not (
        await db.scalars(select(Application).where(Application.user_id == target.id))
    ).all()
    # A valid foreign database ID not supplied by this archive is not authority.
    malicious = deepcopy(archive)
    malicious["models"]["ApplicationStatus"] = []
    with pytest.raises(ValueError, match="not visible"):
        async with db.begin_nested():
            await import_payload_data(
                db, target.id, malicious, {}, lambda **kwargs: None
            )
    malicious = deepcopy(archive)
    malicious["models"]["ApplicationStatus"] = []
    malicious["models"]["Application"] = []
    with pytest.raises(ValueError, match="this archive"):
        async with db.begin_nested():
            await import_payload_data(
                db, target.id, malicious, {}, lambda **kwargs: None
            )


@pytest.mark.parametrize("archived_owned", [True, False])
async def test_archive_global_match_does_not_hide_owned_meaning_conflict(
    db, evidence_archive, archived_owned
):
    owner, target, archive = evidence_archive
    source_status = await db.get(
        ApplicationStatus, archive["models"]["ApplicationStatus"][0]["id"]
    )
    assert source_status is not None
    if archived_owned:
        global_status = ApplicationStatus(name="Own meaning", meaning="offer")
        db.add(global_status)
    else:
        source_status.user_id = None
        global_status = source_status
    conflict = ApplicationStatus(
        name="Own meaning", meaning="rejected", user_id=target.id
    )
    db.add(conflict)
    await db.commit()
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            owner.id, session
        )
    )
    if archived_owned:
        with pytest.raises(ValueError, match="meaning conflict"):
            async with db.begin_nested():
                await import_payload_data(
                    db, target.id, archive, {}, lambda **kwargs: None
                )
        assert not (
            await db.scalars(
                select(Application).where(Application.user_id == target.id)
            )
        ).all()
        # Resolving the actual owned conflict permits the same archive to round-trip.
        conflict.meaning = "offer"
        await db.commit()
    await import_payload_data(db, target.id, archive, {}, lambda **kwargs: None)
    await db.commit()
    exported = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            target.id, session
        )
    )
    imported = exported["models"]["Application"][0]
    assert imported["status_id"] == global_status.id
    for field in ImportService.EVIDENCE_FIELDS["Application"]:
        assert imported[field] == archive["models"]["Application"][0][field]
    assert conflict.meaning == ("offer" if archived_owned else "rejected")


async def test_archive_version_and_evidence_validation(db, evidence_archive):
    _, target, archive = evidence_archive
    service = ImportService(default_registry, IDMapper())
    for mutate in [
        lambda value: value.update(format_version="1.0.0"),
        lambda value: value.update(format_version="9.0.0"),
        lambda value: value["models"]["Application"][0].pop("status_meaning"),
        lambda value: value["models"]["Application"][0].update(
            response_state="not_recorded"
        ),
        lambda value: value["models"]["Application"][0].update(
            response_recorded_at=None
        ),
        lambda value: value["models"]["ApplicationStatus"][0].update(
            meaning="spelling-is-not-meaning"
        ),
        lambda value: value["models"]["ApplicationStatusHistory"][1].update(
            note="secret deleted content"
        ),
    ]:
        malformed = deepcopy(archive)
        mutate(malformed)
        assert not service.validate_export_data(malformed)[0]
        with pytest.raises(ValueError):
            async with db.begin_nested():
                await import_payload_data(
                    db, target.id, malformed, {}, lambda **kwargs: None
                )
    # Old supported archives remain unproven, never inferred from definitions.
    legacy = deepcopy(archive)
    legacy["format_version"] = "1.0.0"
    legacy["models"]["ApplicationStatusHistory"] = legacy["models"][
        "ApplicationStatusHistory"
    ][:1]
    for model, fields in ImportService.EVIDENCE_FIELDS.items():
        for record in legacy["models"][model]:
            for field in fields:
                record.pop(field, None)
    await import_payload_data(db, target.id, legacy, {}, lambda **kwargs: None)
    imported = await db.scalar(
        select(Application).where(Application.user_id == target.id)
    )
    assert imported.status_meaning == "unknown"
    assert imported.response_state == "legacy_unknown"
    history = await db.scalar(
        select(ApplicationStatusHistory).where(
            ApplicationStatusHistory.application_id == imported.id
        )
    )
    assert history.to_meaning is None and history.time_provenance == "legacy_unknown"


async def test_unversioned_import_is_explicitly_legacy_and_rejects_evidence(db):
    target = User(email="old-import@synthetic.test", password_hash="unused")
    db.add(target)
    await db.flush()
    payload = {
        "user": {"email": "legacy@synthetic.test"},
        "applications": [
            {
                "company": "Legacy",
                "job_title": "Role",
                "status": "Interviewing",
                "applied_at": "2026-01-01",
                "status_history": [
                    {
                        "to_status": "Offer",
                        "changed_at": "2026-01-02T00:00:00Z",
                        "note": "Preserved old content",
                    }
                ],
            }
        ],
    }
    await import_payload_data(db, target.id, payload, {}, lambda **kwargs: None)
    application = await db.scalar(
        select(Application).where(Application.user_id == target.id)
    )
    assert (
        application.status_meaning_provenance
        == application.response_state
        == "legacy_unknown"
    )
    payload["applications"][0]["response_state"] = "recorded"
    with pytest.raises(ValueError, match="format_version 2.0.0"):
        await import_payload_data(db, target.id, payload, {}, lambda **kwargs: None)


async def test_database_rejects_incoherent_response_and_gap(db, evidence_archive):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    owner, _, archive = evidence_archive
    for statement in [
        "UPDATE applications SET response_state = 'not_recorded'",
        "UPDATE application_status_history SET note = 'content' WHERE is_gap = true",
        "UPDATE application_status_history SET to_meaning = NULL WHERE to_meaning_provenance = 'recorded'",
        "UPDATE application_statuses SET meaning = 'arbitrary label'",
    ]:
        with pytest.raises(IntegrityError):
            async with db.begin_nested():
                await db.execute(text(statement))


async def test_scoped_zip_router_preserves_evidence_contract(
    client, db, evidence_archive
):
    import io
    import json
    import zipfile

    from app.core.security import create_access_token

    owner, _, archive = evidence_archive
    headers = {
        "Authorization": "Bearer "
        + create_access_token(
            {"sub": owner.id, "session_version": owner.session_version}
        )
    }
    response = await client.get("/api/export/zip", headers=headers)
    assert response.status_code == 200, response.text
    with zipfile.ZipFile(io.BytesIO(response.content)) as zipped:
        manifest = json.loads(zipped.read("manifest.json"))
        payload = json.loads(zipped.read("data.json"))
    assert manifest["format_version"] == payload["format_version"] == "2.0.0"
    assert "SECRET-EXCLUDED" not in json.dumps(payload)
    assert len(payload["models"]["Application"]) == 1
    assert payload["models"]["Application"][0]["response_state"] == "recorded"
    assert any(row["is_gap"] for row in payload["models"]["ApplicationStatusHistory"])
    assert ImportService(default_registry, IDMapper()).validate_export_data(payload)[0]
