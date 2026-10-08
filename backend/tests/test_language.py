"""Language is an owner preference and explicit text-request input, not authority."""

from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace
from tests.test_interview_feedback import setup_round
from tests.test_report_responses_protocol import (
    application_sources,
    responses_fixture,
    text_settings,
)
from tests.test_report_session_context import empty_output
from tests.test_user_preferences import auth_headers as auth_headers
from tests.test_user_preferences import test_user as test_user

from app.core.seed import seed_defaults
from app.models import ApplicationStatus, InterviewJob, RoundType, User
from app.services import interview_jobs
from app.services.export_registry import default_registry
from app.services.export_service import ExportService
from app.services.import_id_mapper import IDMapper
from app.services.import_service import ImportService
from app.services.transcription_executor import TranscriptionExecutor


async def test_language_default_validation_and_owner_scope(
    client, db, test_user, auth_headers
):
    other = User(
        email="another-language@example.com",
        password_hash="unused",
        settings={"language": "en"},
    )
    db.add(other)
    await db.commit()
    assert (await client.get("/api/user-preferences", headers=auth_headers)).json()[
        "language"
    ] == "en"
    response = await client.patch(
        "/api/user-preferences", headers=auth_headers, json={"language": "sr-Latn"}
    )
    assert response.status_code == 200
    assert response.json()["language"] == "sr-Latn"
    await db.refresh(other)
    assert other.settings == {"language": "en"}
    for value in (None, "sr", "sr-Cyrl", "private-invalid-value"):
        response = await client.patch(
            "/api/user-preferences", headers=auth_headers, json={"language": value}
        )
        assert response.status_code == 422
        assert response.json()["code"] == "validation_error"
        assert "private-invalid-value" not in response.text
    assert (await client.get("/api/user-preferences", headers=auth_headers)).json()[
        "language"
    ] == "sr-Latn"


async def test_language_archive_restores_only_target_preference(db, test_user):
    test_user.settings = {
        "language": "sr-Latn",
        "private_credential": "not-transferable",
    }
    recipient = User(
        email="language-recipient@example.com",
        password_hash="untouched",
        is_admin=False,
        settings={"theme": "dracula"},
    )
    db.add(recipient)
    await db.commit()
    await seed_defaults(db)
    custom = RoundType(name="Technical", user_id=test_user.id, builtin_key=None)
    custom_status = ApplicationStatus(
        name="Applied", meaning="applied", user_id=test_user.id
    )
    db.add_all([custom, custom_status])
    await db.commit()

    def transfer(session):
        payload = ExportService(default_registry).export_user_data(
            test_user.id, session
        )
        archived = payload["models"]["User"][0]
        assert archived["settings"] == {"language": "sr-Latn"}
        archived["is_admin"] = True
        for row in payload["models"]["RoundType"]:
            if row.get("user_id"):
                row["builtin_key"] = "technical"  # Cannot forge a built-in identity.
        ImportService(default_registry, IDMapper()).import_user_data(
            payload, recipient.id, session
        )

    await db.run_sync(transfer)
    await db.refresh(recipient)
    assert recipient.settings == {"theme": "dracula", "language": "sr-Latn"}
    assert recipient.is_admin is False
    assert recipient.password_hash == "untouched"
    restored = await db.scalar(
        select(RoundType).where(
            RoundType.user_id == recipient.id, RoundType.name == "Technical"
        )
    )
    assert restored is not None and restored.builtin_key is None
    restored_status = await db.scalar(
        select(ApplicationStatus).where(
            ApplicationStatus.user_id == recipient.id,
            ApplicationStatus.name == "Applied",
        )
    )
    assert restored_status is not None and restored_status.builtin_key is None


async def test_builtin_identity_survives_renaming_and_reseeding(db):
    await seed_defaults(db)
    status = await db.scalar(
        select(ApplicationStatus).where(ApplicationStatus.builtin_key == "applied")
    )
    round_type = await db.scalar(
        select(RoundType).where(RoundType.builtin_key == "technical")
    )
    status.name = "Renamed status"
    round_type.name = "Renamed round"
    await db.commit()
    await seed_defaults(db)
    assert (
        len(
            (
                await db.scalars(
                    select(ApplicationStatus).where(
                        ApplicationStatus.builtin_key == "applied"
                    )
                )
            ).all()
        )
        == 1
    )
    assert (
        len(
            (
                await db.scalars(
                    select(RoundType).where(RoundType.builtin_key == "technical")
                )
            ).all()
        )
        == 1
    )


@pytest.mark.parametrize("scope", ["INTERVIEW", "APPLICATION", "PIPELINE"])
async def test_new_report_pins_language_without_translating_quotes(
    client, db, workspace, monkeypatch, scope
):
    from app.main import app

    executor = TranscriptionExecutor(
        async_sessionmaker(db.bind, expire_on_commit=False)
    )
    executor.accepting = True
    monkeypatch.setattr(app.state, "transcription_executor", executor, raising=False)
    async with responses_fixture(body=empty_output("chat_completions")) as (
        endpoint,
        calls,
    ):
        round_id = await setup_round(client, db, workspace, endpoint)
        path = {
            "INTERVIEW": f"/api/rounds/{round_id}/interview-feedback",
            "APPLICATION": f"/api/applications/{workspace[4]}/feedback",
            "PIPELINE": "/api/analytics/feedback",
        }[scope]
        state = (await client.get(path)).json()
        request = {
            "intent_id": str(uuid4()),
            "language": "sr-Latn",
            "config_revision": state["capability"]["configuration_revision"],
        }
        if scope != "PIPELINE":
            request["generation"] = state["generation"]
        response = await client.post(path, json=request)
        assert response.status_code == 202
        job = await db.get(InterviewJob, response.json()["id"])
        assert job.manifest["output_language"] == "sr-Latn"
        # A changed browser/account language cannot alter an already admitted request.
        await client.patch("/api/user-preferences", json={"language": "en"})
        assert not calls
        duplicate = await client.post(path, json={**request, "language": "en"})
        assert duplicate.json()["id"] == job.id
        job.state, job.claim_id = "analyzing", str(uuid4())
        await db.commit()
        await interview_jobs.execute(executor, job.id, job.claim_id)
        assert calls
        for _, body in calls:
            instructions = body.get("instructions") or body["messages"][0]["content"]
            assert "Serbian" in instructions
            assert "quoted source passages unchanged" in instructions
        report = (await client.get(path)).json()["report"]
        assert report["output_language"] == "sr-Latn"


@pytest.mark.parametrize("db_engine", ["20260419_report_scopes"], indirect=True)
async def test_migration_backfills_only_builtin_definitions(db, db_engine):
    from tests.conftest import _run_alembic_upgrade

    owner = User(
        email="migration-language@example.com",
        password_hash="unused",
        settings={"theme": "dracula"},
    )
    db.add(owner)
    await db.commit()
    for identity, user_id in (("global", None), ("custom", owner.id)):
        await db.execute(
            text(
                'INSERT INTO application_statuses (id,name,normalized_name,color,is_default,user_id,"order",meaning) VALUES (:id,'
                + "'Applied','applied','#83a598',:is_default,:user_id,0,'applied')"
            ),
            {"id": identity, "user_id": user_id, "is_default": user_id is None},
        )
        await db.execute(
            text(
                "INSERT INTO round_types (id,name,normalized_name,is_default,user_id) VALUES (:id,'Technical','technical',:is_default,:user_id)"
            ),
            {"id": identity, "user_id": user_id, "is_default": user_id is None},
        )
    await db.commit()
    async with db_engine.begin() as connection:
        await connection.run_sync(_run_alembic_upgrade, str(db_engine.url))
    await db.refresh(owner)
    assert owner.settings == {"theme": "dracula", "language": "en"}
    assert (await db.get(ApplicationStatus, "global")).builtin_key == "applied"
    assert (await db.get(ApplicationStatus, "custom")).builtin_key is None
    assert (await db.get(RoundType, "global")).builtin_key == "technical"
    assert (await db.get(RoundType, "custom")).builtin_key is None


@pytest.mark.parametrize("protocol", ["responses", "chat_completions"])
async def test_serbian_prompt_preserves_source_text_in_both_protocols(protocol):
    import json

    from app.services.interview_text import analyze_section

    sources = application_sources()
    async with responses_fixture(body=empty_output(protocol)) as (endpoint, calls):
        await analyze_section(
            text_settings(endpoint, protocol),
            sources,
            [],
            "APPLICATION",
            output_language="sr-Latn",
        )
    payload = calls[0][1]
    instructions = (
        payload["instructions"]
        if protocol == "responses"
        else payload["messages"][0]["content"]
    )
    submitted = json.loads(
        payload["input"]
        if protocol == "responses"
        else payload["messages"][1]["content"]
    )
    assert "Serbian (Latin script)" in instructions
    assert submitted["sources"] == sources


async def test_explicit_lead_extraction_uses_request_language(
    client, db, workspace, monkeypatch
):
    from unittest.mock import AsyncMock

    from app.api import job_leads
    from app.schemas.job_lead import JobLeadExtractionInput

    async with responses_fixture() as (endpoint, calls):
        await setup_round(client, db, workspace, endpoint)
        lead = (
            await client.post(
                "/api/job-leads",
                json={
                    "url": "https://example.com/language-role",
                    "text": "A role at a company.",
                },
            )
        ).json()
        extract = AsyncMock(
            return_value=JobLeadExtractionInput(title="Role", company="Company")
        )
        monkeypatch.setattr(job_leads, "extract_job_data", extract)
        response = await client.post(
            f"/api/job-leads/{lead['id']}/extract",
            json={"expected_revision": lead["revision"], "language": "sr-Latn"},
        )
        assert response.status_code == 200, response.text
        assert extract.call_args.kwargs["output_language"] == "sr-Latn"
        assert calls == []
