"""Application- and pipeline-scope contract evidence. Synthetic, not model quality."""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from tests.test_core_mutation_integrity import workspace as workspace

from app.models import Application, InterviewJob, Round, SystemSettings, User
from app.schemas.ai_settings import AISettingsUpdate
from app.services.ai_settings import update_ai_settings
from app.services.interview_evidence import (
    application_evidence_sources,
    application_sections,
    application_snapshot,
    pipeline_evidence_sources,
    pipeline_sections,
    pipeline_snapshot,
    sections,
)
from app.services.interview_text import validate_section
from app.services.transcription_executor import TranscriptionExecutor


def application_output(sources):
    requirement = next(
        (
            s
            for s in sources
            if s["kind"] == "requirement"
            and not s["text"].lstrip().startswith(("{", "["))
        ),
        None,
    )
    cited = (
        [requirement]
        if requirement
        else [next(s for s in sources if not s["text"].lstrip().startswith(("{", "[")))]
    )
    return {
        "findings": [
            {
                "subject": "application",
                "coaching": {
                    "version": 1,
                    "kind": "application",
                    "title": "Check the recorded next step",
                    "context_citations": [0],
                    "branches": [
                        {
                            "condition": "If these are still the current details",
                            "action": "Check your own notes before taking the next step.",
                        }
                    ],
                },
                "observation": "The application has recorded history for this timeline.",
                "interpretation": "Recorded stage evidence only; employer motives are unknown.",
                "action": "Continue the recorded next step and keep history current.",
                "limitations": "One application; current documents are not historical submission proof.",
                "citations": [
                    {"source_id": s["id"], "quote": s["text"][:200]} for s in cited
                ],
            }
        ],
        "limitations": [],
    }


def pipeline_output(sources):
    from tests.test_feedback_coaching import coached_section

    records = next(
        (s for s in sources if s["id"] == "pipeline:recorded_approaches:0"), None
    )
    if records and json.loads(records["text"])["applications"]:
        return coached_section(sources, "PIPELINE")
    metrics = next((s for s in sources if s["kind"] == "pipeline_metrics"), None)
    cited = [metrics] if metrics else sources[:1]
    return {
        "findings": [
            {
                "subject": "pipeline",
                "coaching_unavailable": "complete_record_unavailable",
                "observation": "The supplied metrics show the recorded response rate.",
                "interpretation": "A recorded association, not proof of a cause.",
                "action": "Review applications with no recorded response evidence first.",
                "limitations": "Small samples and missing history limit conclusions.",
                "citations": [
                    {"source_id": s["id"], "quote": s["text"][:200]} for s in cited
                ],
            }
        ],
        "limitations": [],
    }


@asynccontextmanager
async def text_fixture(*, scope_expected, hostile=False):
    calls, tasks = [], set()

    async def handle(reader, writer):
        task = asyncio.current_task()
        tasks.add(task)
        try:
            headers = await reader.readuntil(b"\r\n\r\n")
            length = int(
                next(
                    line.split(b":", 1)[1]
                    for line in headers.split(b"\r\n")
                    if line.lower().startswith(b"content-length:")
                )
            )
            body = json.loads(await reader.readexactly(length))
            calls.append((headers, body))
            sources = json.loads(body["messages"][1]["content"])["sources"]
            output = (
                application_output(sources)
                if scope_expected == "APPLICATION"
                else pipeline_output(sources)
            )
            if hostile:
                output["findings"][0]["citations"][0]["source_id"] = "foreign:secret"
            payload = json.dumps(
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": json.dumps(output)},
                        }
                    ]
                }
            ).encode()
            writer.write(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                + str(len(payload)).encode()
                + b"\r\nConnection: close\r\n\r\n"
                + payload
            )
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()
            tasks.discard(task)

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    try:
        yield f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}/v1", calls
    finally:
        server.close()
        await server.wait_closed()
        for task in list(tasks):
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def configure(db, endpoint):
    await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_model="openai/synthetic-text",
            litellm_base_url=endpoint,
            text_keyless=True,
        ),
    )


async def wait_state(sessions, **match):
    async with asyncio.timeout(30):
        while True:
            async with sessions() as session:
                job = await session.scalar(
                    select(InterviewJob)
                    .filter_by(**match)
                    .order_by(InterviewJob.created_at.desc())
                )
                if job and job.state not in ("queued", "analyzing"):
                    return job
            await asyncio.sleep(0.05)


async def start_executor(db_engine, tmp_path, **match):
    from app.main import app

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    executor = TranscriptionExecutor(sessions, tmp_path)
    app.state.transcription_executor = executor
    async with executor.lifespan():
        return await wait_state(sessions, **match)


@pytest.mark.parametrize(
    ("batcher", "context_ids"),
    [
        (sections, ["requirement:0", "profile:0"]),
        (application_sections, ["requirement:0", "profile:0"]),
        (pipeline_sections, ["profile:0"]),
    ],
)
def test_report_sections_retain_only_their_scope_context(batcher, context_ids):
    sources = [
        {"id": "requirement:0", "kind": "requirement", "text": "r" * 4000},
        {"id": "profile:0", "kind": "profile", "text": "p" * 4000},
        *[
            {"id": f"answer:{i}", "kind": "transcript", "text": "a" * 4000}
            for i in range(5)
        ],
    ]
    batches = batcher(sources)
    assert [[source["id"] for source in batch] for batch in batches] == [
        ["requirement:0", "profile:0", "answer:0", "answer:1", "answer:2", "answer:3"],
        ["answer:4", *context_ids],
    ]


async def test_report_reads_keep_selected_scope_metadata(client, db, workspace):
    owner, _, _, types, app_id = workspace
    application = await db.get(Application, app_id)
    assert application is not None
    application.report = {"scope": "APPLICATION", "config_revision": "older"}
    application.report_reason = "Application source changed"
    application.report_generation = 22
    round_row = Round(
        application_id=app_id,
        round_type_id=types[0].id,
        interview_report={"scope": "INTERVIEW", "config_revision": "older"},
        interview_report_reason="Interview source changed",
        interview_generation=11,
    )
    db.add_all(
        [round_row, SystemSettings(key="text_revision", value="current-revision")]
    )
    await db.commit()
    # Bypass the identity map when seeding the stored account report. The GET
    # must return committed data, not the caller's previously loaded account.
    await db.execute(
        update(User)
        .where(User.id == owner.id)
        .values(
            pipeline_report={"scope": "PIPELINE", "config_revision": "older"},
            pipeline_report_reason="Pipeline source changed",
            pipeline_generation=33,
        )
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    for path, scope, generation, reason in [
        (
            f"/api/rounds/{round_row.id}/interview-feedback",
            "INTERVIEW",
            11,
            "Interview source changed",
        ),
        (
            f"/api/applications/{app_id}/feedback",
            "APPLICATION",
            22,
            "Application source changed",
        ),
        (
            "/api/analytics/feedback?period=all",
            "PIPELINE",
            33,
            "Pipeline source changed",
        ),
    ]:
        response = await client.get(path)
        assert response.status_code == 200, response.text
        state = response.json()
        assert state["report"] == {"scope": scope, "config_revision": "older"}
        assert state["generation"] == generation
        assert state["stale_reason"] == reason
        assert state["capability"]["configuration_revision"] == "current-revision"


async def test_application_scope_report_citations_and_staleness(
    client, db, db_engine, workspace, tmp_path
):
    owner, _, _, _types, app_id = workspace
    from app.main import app

    async with text_fixture(scope_expected="APPLICATION") as (endpoint, calls):
        await configure(db, endpoint)
        sessions = async_sessionmaker(db_engine, expire_on_commit=False)
        executor = TranscriptionExecutor(sessions, tmp_path)
        app.state.transcription_executor = executor
        state = (await client.get(f"/api/applications/{app_id}/feedback")).json()
        assert state["generation"] == 0
        async with executor.lifespan():
            response = await client.post(
                f"/api/applications/{app_id}/feedback",
                json={
                    "intent_id": str(uuid4()),
                    "generation": state["generation"],
                    "config_revision": state["capability"]["configuration_revision"],
                },
            )
            assert response.status_code == 202, response.text
            job = await wait_state(sessions, scope="APPLICATION", application_id=app_id)
        assert job.state == "complete", job.error
        assert calls
        after = (await client.get(f"/api/applications/{app_id}/feedback")).json()
        report = after["report"]
        assert report["scope"] == "APPLICATION"
        assert report["application_id"] == app_id
        assert after["stale_reason"] is None
        # Owner-scoped: every cited source belongs to this application only.
        prefixes = {source["id"].split(":")[0] for source in report["sources"]}
        assert prefixes <= {"application", "document", "round", "history", "profile"}
        assert all(
            source["id"].split(":")[1] in (app_id, "work_history", "skills")
            for source in report["sources"]
            if source["id"].split(":")[0] in ("application", "document")
        )
        assert owner.id


async def test_application_scope_rejects_foreign_citation(client, db, workspace):
    _owner, _, _, _types, app_id = workspace
    data, _digest = await application_snapshot(db, workspace[0].id, app_id)
    sources, _limits = await application_evidence_sources(data)
    assert sources
    bad = application_output(sources)
    bad["findings"][0]["citations"][0]["source_id"] = "foreign:secret"
    with pytest.raises(ValueError):
        validate_section(bad, sources, "APPLICATION")
    # A wrong subject for the scope is rejected too.
    wrong = application_output(sources)
    wrong["findings"][0]["subject"] = "pipeline"
    with pytest.raises(ValueError):
        validate_section(wrong, sources, "APPLICATION")


async def test_application_report_cites_only_scoped_sources(db, workspace):
    _owner, _, _, _types, app_id = workspace
    data, digest = await application_snapshot(db, workspace[0].id, app_id)
    sources, limits = await application_evidence_sources(data)
    batches = application_sections(sources)
    assert digest and batches
    # Deterministic batching keeps identical content stable across calls.
    again, digest2 = await application_snapshot(db, workspace[0].id, app_id)
    assert digest == digest2
    repeat, _ = await application_evidence_sources(again)
    assert [s["id"] for s in sources] == [s["id"] for s in repeat]
    assert any("not historical submission" in limit for limit in limits)


async def test_pipeline_scope_uses_deterministic_metrics(
    client, db, db_engine, workspace, tmp_path
):
    from app.main import app

    async with text_fixture(scope_expected="PIPELINE") as (endpoint, calls):
        await configure(db, endpoint)
        sessions = async_sessionmaker(db_engine, expire_on_commit=False)
        executor = TranscriptionExecutor(sessions, tmp_path)
        app.state.transcription_executor = executor
        state = (await client.get("/api/analytics/feedback?period=30d")).json()
        async with executor.lifespan():
            response = await client.post(
                "/api/analytics/feedback",
                json={
                    "intent_id": str(uuid4()),
                    "config_revision": state["capability"]["configuration_revision"],
                    "period": "30d",
                },
            )
            assert response.status_code == 202, response.text
            job = await wait_state(sessions, scope="PIPELINE")
        assert job.state == "complete", job.error
        # The prompt carried computed metrics, not a request to compute them.
        sent = json.loads(calls[0][1]["messages"][1]["content"])["sources"]
        metrics = next(s for s in sent if s["kind"] == "pipeline_metrics")
        assert "response_rate" in metrics["text"]
        after = (await client.get("/api/analytics/feedback?period=30d")).json()
        assert after["report"]["scope"] == "PIPELINE"
        assert after["report"]["period"] == "30d"


async def test_pipeline_scope_single_active_and_wrong_subject(db, workspace):
    data, digest = await pipeline_snapshot(db, workspace[0].id, "30d", None, "UTC")
    sources, _limits = await pipeline_evidence_sources(data)
    batches = pipeline_sections(sources)
    assert digest and batches
    wrong = pipeline_output(sources)
    wrong["findings"][0]["subject"] = "application"
    with pytest.raises(ValueError):
        validate_section(wrong, sources, "PIPELINE")
    good = pipeline_output(sources)
    assert validate_section(good, sources, "PIPELINE")["findings"]
    # Inexact quotes are still rejected for the new scopes.
    inexact = pipeline_output(sources)
    inexact["findings"][0]["citations"][0]["quote"] = "not present in any source"
    with pytest.raises(ValueError):
        validate_section(inexact, sources, "PIPELINE")


async def test_scope_insufficient_key_is_denied(
    client, db, db_engine, workspace, tmp_path
):
    # A key that may read records but not generate analysis cannot start work.
    from app.core.security import generate_api_token, hash_api_key
    from app.main import app
    from app.models import UserAPIKey

    user = workspace[0]
    raw_key = generate_api_token()
    key = UserAPIKey(
        user_id=user.id,
        label="read-only",
        preset="custom",
        scopes=["analytics:read", "applications:read"],
        key_prefix=raw_key[:8],
        key_hash=hash_api_key(raw_key),
    )
    db.add(key)
    await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    executor = TranscriptionExecutor(sessions, tmp_path)
    app.state.transcription_executor = executor
    async with executor.lifespan():
        response = await client.post(
            f"/api/applications/{workspace[4]}/feedback",
            # The workspace fixture sets a client-wide bearer header, and JWT takes
            # precedence over an API key. Clear it so this request is key-authenticated.
            headers={"X-API-Key": raw_key, "Authorization": ""},
            json={
                "intent_id": str(uuid4()),
                "generation": 0,
                "config_revision": "x",
            },
        )
    assert response.status_code == 403, response.text
    assert "scope" in response.json()["detail"]


async def test_source_change_marks_application_and_pipeline_stale(
    client, db, workspace
):
    _owner, _, _, _types, app_id = workspace

    application = await db.get(Application, app_id)
    application.report = {
        "version": 1,
        "scope": "APPLICATION",
        "fingerprint": "stale-fingerprint",
        "config_revision": "x",
    }
    await db.commit()
    response = await client.patch(
        f"/api/applications/{app_id}",
        json={"requirements_must_have": ["A newly recorded requirement"]},
    )
    assert response.status_code == 200
    state = (await client.get(f"/api/applications/{app_id}/feedback")).json()
    assert state["stale_reason"]
    await db.commit()


async def test_source_mutation_marks_application_report_stale_but_keeps_content(
    client, db, workspace
):
    """A mutation (not a removal) marks stale but retains retained content."""
    _owner, _, _, types, app_id = workspace

    application = await db.get(Application, app_id)
    application.report = {"version": 1, "scope": "APPLICATION", "findings": []}
    application.report_reason = None
    await db.commit()
    response = await client.post(
        f"/api/applications/{app_id}/rounds",
        json={"round_type_id": types[0].id},
    )
    assert response.status_code in (200, 201), response.text
    # A new round marks the report stale; it is not an explicit source removal,
    # so retained content is kept until the source itself is removed.
    state = (await client.get(f"/api/applications/{app_id}/feedback")).json()
    assert state["stale_reason"]
    assert state["report"] is not None


@pytest.mark.parametrize("kind", ["cv", "cover_letter"])
@pytest.mark.parametrize(
    "mutation", ["first_upload", "replacement", "fallback", "removal"]
)
async def test_document_mutation_retains_only_safe_saved_reports(
    client, db, workspace, monkeypatch, tmp_path, kind, mutation
):
    from types import SimpleNamespace

    from app.api import applications

    monkeypatch.setattr(
        applications,
        "get_settings",
        lambda: SimpleNamespace(upload_dir=str(tmp_path), max_document_size_mb=10),
    )
    owner, _, _, types, app_id = workspace
    application = await db.get(Application, app_id)
    if mutation in ("replacement", "removal"):
        setattr(application, kind + "_path", "previous-document.txt")
    if mutation != "first_upload":
        setattr(application, kind + "_text", "Previous document fallback")
    reports = {
        scope: {"scope": scope, "findings": [{"observation": "Saved source text"}]}
        for scope in ("INTERVIEW", "APPLICATION", "PIPELINE")
    }
    round_row = Round(
        application_id=app_id,
        round_type_id=types[0].id,
        interview_report=reports["INTERVIEW"],
    )
    db.add(round_row)
    application.report = reports["APPLICATION"]
    owner.pipeline_report = reports["PIPELINE"]
    await db.commit()
    generations = (
        round_row.interview_generation,
        application.report_generation,
        owner.pipeline_generation,
    )
    revision = application.evidence_revision
    path = f"/api/applications/{app_id}/" + kind.replace("_", "-")
    if mutation == "removal":
        response = await client.delete(path)
    else:
        response = await client.post(
            path,
            files={"file": ("current.txt", b"Current document text", "text/plain")},
        )
    assert response.status_code == 200, response.text
    await db.refresh(application)
    assert application.evidence_revision == revision + 1
    assert getattr(application, kind + "_text") is None
    assert bool(getattr(application, kind + "_path")) == (mutation != "removal")
    for index, (endpoint, scope) in enumerate(
        [
            (f"/api/rounds/{round_row.id}/interview-feedback", "INTERVIEW"),
            (f"/api/applications/{app_id}/feedback", "APPLICATION"),
            ("/api/analytics/feedback?period=30d", "PIPELINE"),
        ]
    ):
        response = await client.get(endpoint)
        assert response.status_code == 200, response.text
        state = response.json()
        assert state["generation"] == generations[index] + 1
        if mutation == "first_upload":
            assert state["report"] == reports[scope]
            assert state["stale_reason"].endswith("evidence changed; rerun required")
        else:
            assert state["report"] is None
            assert state["stale_reason"] == "source-removed; rerun required"
    assert not list(await db.scalars(select(InterviewJob)))


async def test_removal_clears_application_report_content(client, db, workspace):
    """A real removal (removed=True) must clear retained report content."""
    _owner, _, _, _types, app_id = workspace

    application = await db.get(Application, app_id)
    application.report = {
        "version": 1,
        "scope": "APPLICATION",
        "findings": [{"observation": "retained source text"}],
    }
    application.report_reason = None
    await db.commit()
    # Deleting the current document is a real source removal.
    response = await client.delete(f"/api/applications/{app_id}/cv")
    assert response.status_code == 200, response.text
    state = (await client.get(f"/api/applications/{app_id}/feedback")).json()
    assert state["report"] is None
    assert state["stale_reason"] == "source-removed; rerun required"


async def test_removal_clears_pipeline_report_content(client, db, workspace):
    """A real removal must clear the retained pipeline report content too."""
    owner, _, _, _types, app_id = workspace

    owner.pipeline_report = {
        "version": 1,
        "scope": "PIPELINE",
        "findings": [{"observation": "retained source text"}],
    }
    owner.pipeline_report_reason = None
    await db.commit()
    application = await db.get(Application, app_id)
    application.report = {"version": 1, "scope": "APPLICATION", "findings": []}
    await db.commit()
    response = await client.delete(f"/api/applications/{app_id}/cv")
    assert response.status_code == 200, response.text
    state = (await client.get("/api/analytics/feedback?period=30d")).json()
    assert state["report"] is None
    assert state["stale_reason"] == "source-removed; rerun required"


async def test_pipeline_report_matches_analytics_for_non_utc_zone(
    client, db, workspace
):
    """The pipeline report must not diverge from /api/analytics/pipeline by zone.

    A UTC-hardcoded report would compute a different cohort window than the
    dashboard for the same instant. Compare the deterministic metrics both paths
    feed from, for a distinctly non-UTC effective zone.
    """
    owner, _, _, _types, _app_id = workspace
    zone = "Pacific/Kiritimati"  # UTC+14.
    as_of = datetime.fromisoformat("2026-01-15T00:00:00+14:00")
    headers = {"Time-Zone": zone}
    encoded = "2026-01-15T00%3A00%3A00%2B14%3A00"
    analytics = (
        await client.get(
            f"/api/analytics/pipeline?period=all&as_of={encoded}", headers=headers
        )
    ).json()
    data, digest = await pipeline_snapshot(db, owner.id, "all", as_of, zone)
    # The report's deterministic metrics must equal the dashboard's for the
    # same period, instant and effective zone.
    for key in ("total_applications", "responded", "response_rate"):
        assert data["metrics"][key] == analytics[key], key
    assert data["time_zone"] == zone
    # Discriminating case: this instant falls on a different local date in UTC+14
    # than in UTC, so the cohort window differs. A UTC-hardcoded snapshot would
    # therefore report a different window (and can include/exclude applications).
    scope = data["metrics"]["scope"]
    assert scope["as_of"].isoformat() == analytics["scope"]["as_of"].replace(
        "Z", "+00:00"
    )
    assert scope["cohort_end"].isoformat() == analytics["scope"]["cohort_end"]
    utc_data, utc_digest = await pipeline_snapshot(db, owner.id, "all", as_of, "UTC")
    assert utc_data["metrics"]["scope"]["cohort_end"] != scope["cohort_end"]
    # The zone is part of the fingerprint: changing it changes the digest, so a
    # zone change marks the stored report stale.
    assert digest != utc_digest


async def test_non_utc_as_of_does_not_falsely_stale_a_current_pipeline_report(
    client, db, db_engine, workspace, tmp_path
):
    """A current report must not read back stale for a non-UTC offset as_of.

    The stored instant is UTC-normalized, so comparing raw caller renderings
    would always differ for the same moment.
    """
    from app.main import app

    owner = workspace[0]
    as_of = "2026-01-15T00:00:00+14:00"
    encoded = "2026-01-15T00%3A00%3A00%2B14%3A00"
    headers = {"Time-Zone": "Pacific/Kiritimati"}
    async with text_fixture(scope_expected="PIPELINE") as (endpoint, _calls):
        await configure(db, endpoint)
        sessions = async_sessionmaker(db_engine, expire_on_commit=False)
        executor = TranscriptionExecutor(sessions, tmp_path)
        app.state.transcription_executor = executor
        state = (
            await client.get(
                f"/api/analytics/feedback?period=all&as_of={encoded}",
                headers=headers,
            )
        ).json()
        async with executor.lifespan():
            response = await client.post(
                "/api/analytics/feedback",
                headers=headers,
                json={
                    "intent_id": str(uuid4()),
                    "config_revision": state["capability"]["configuration_revision"],
                    "period": "all",
                    "as_of": as_of,
                },
            )
            assert response.status_code == 202, response.text
            job = await wait_state(sessions, scope="PIPELINE")
        assert job.state == "complete", job.error
        after = (
            await client.get(
                f"/api/analytics/feedback?period=all&as_of={encoded}",
                headers=headers,
            )
        ).json()
        assert after["report"] is not None
        assert after["stale_reason"] is None


async def test_pipeline_as_of_validation_rejects_naive_and_future(client, workspace):
    """The pipeline scope must validate as_of exactly like the analytics clock."""
    for value in ("2026-01-15T00%3A00%3A00", "2999-01-01T00%3A00%3A00%2B00%3A00"):
        response = await client.get(f"/api/analytics/feedback?period=30d&as_of={value}")
        assert response.status_code == 422, (value, response.text)
        assert (
            response.json()["detail"]
            == "as_of must be an offset-aware instant, not in the future"
        )
    # A valid offset-aware past instant still works.
    ok = await client.get(
        "/api/analytics/feedback?period=all&as_of=2026-01-15T00%3A00%3A00%2B00%3A00"
    )
    assert ok.status_code == 200, ok.text


async def test_pipeline_request_rejects_unvalidated_as_of(
    client, db, db_engine, workspace, tmp_path
):
    """The POST path validates as_of through the same clock before admitting work."""
    from app.main import app

    async with text_fixture(scope_expected="PIPELINE") as (endpoint, _calls):
        await configure(db, endpoint)
        sessions = async_sessionmaker(db_engine, expire_on_commit=False)
        executor = TranscriptionExecutor(sessions, tmp_path)
        app.state.transcription_executor = executor
        state = (await client.get("/api/analytics/feedback?period=30d")).json()
        async with executor.lifespan():
            response = await client.post(
                "/api/analytics/feedback",
                json={
                    "intent_id": str(uuid4()),
                    "config_revision": state["capability"]["configuration_revision"],
                    "period": "30d",
                    "as_of": "2026-01-15T00:00:00",
                },
            )
        assert response.status_code == 422, response.text
        assert (
            response.json()["detail"]
            == "as_of must be an offset-aware instant, not in the future"
        )
