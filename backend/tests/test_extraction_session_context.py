"""Reviewed extraction wire contracts against an offline loopback provider."""

import json
import socket
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import get_db
from app.core.security import create_access_token
from app.core.seed import seed_defaults
from app.main import app
from app.models import ApplicationStatus, InterviewJob, User
from app.schemas.ai_settings import AISettingsUpdate
from app.services import job_analyses
from app.services.ai_settings import update_ai_settings
from app.services.interview_text import ReportFailure
from app.services.transcription_executor import TranscriptionExecutor

SOURCE = "Engineer at North. Python required."
OUTPUT = json.dumps(
    {
        "items": [
            {
                "id": "python",
                "field": "must_have",
                "value": "Python",
                "quote": "Python required",
            }
        ]
    }
)


@pytest.fixture
async def wire(client, db, db_engine):
    calls, replies = [], deque()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def get_session():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = get_session

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            calls.append((self.path, self.headers, body))
            status, content = replies.popleft() if replies else (200, OUTPUT)
            if status == 0:
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            payload = (
                {
                    "choices": [
                        {"finish_reason": "stop", "message": {"content": content}}
                    ]
                }
                if status == 200
                else {"error": {"message": "Offline rejection"}}
            )
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        await seed_defaults(db)
        owner = User(email="wire@example.com", password_hash="unused")
        db.add(owner)
        await db.commit()
        client.headers["Authorization"] = "Bearer " + create_access_token(
            {"sub": owner.id, "session_version": owner.session_version}
        )
        await update_ai_settings(
            db,
            AISettingsUpdate(
                litellm_model="openai/fixture",
                litellm_api_key="offline-key",
                litellm_base_url=f"http://127.0.0.1:{server.server_port}/v1",
                text_protocol="chat_completions",
            ),
        )
        status_id = await db.scalar(
            select(ApplicationStatus.id).where(ApplicationStatus.meaning == "applied")
        )
        yield SimpleNamespace(
            calls=calls, replies=replies, sessions=sessions, status_id=status_id
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


async def execute(wire, analysis_id):
    async with wire.sessions() as db:
        job = await db.scalar(
            select(InterviewJob)
            .where(InterviewJob.analysis_id == analysis_id)
            .order_by(InterviewJob.created_at.desc())
        )
        job.state, job.claim_id = "analyzing", str(uuid4())
        job_id, claim = job.id, job.claim_id
        await db.commit()
    executor = TranscriptionExecutor(wire.sessions)
    try:
        await job_analyses.execute(executor, job_id, claim)
    except ReportFailure as error:
        await executor.finish_failure(job_id, claim, "failed", True, error.safe_message)
    async with wire.sessions() as db:
        return await db.get(InterviewJob, job_id)


def session(call):
    path, headers, body = call
    assert path == "/v1/chat/completions"
    context = headers["x-opencode-session"]
    assert str(UUID(context)) == context
    assert headers["Authorization"] == "Bearer offline-key"
    assert body["model"] == "fixture" and body["response_format"] == {
        "type": "json_object"
    }
    assert [item["role"] for item in body["messages"]] == ["system", "user"]
    source = json.loads(body["messages"][1]["content"])["sources"][0]["data"]
    assert source["posting"] == SOURCE
    assert context not in json.dumps(body)
    return context


async def test_saved_lead_queues_once_and_never_applies_without_review(client, wire):
    saved = await client.post(
        "/api/job-leads",
        json={
            "url": "https://jobs.example/one",
            "text": SOURCE,
            "title": "Human title",
        },
    )
    lead = saved.json()
    path = "/api/job-leads/" + lead["id"]
    contexts = []
    for _ in range(2):
        response = await client.post(
            path + "/extract", json={"expected_revision": lead["revision"]}
        )
        assert response.status_code == 200, response.text
        lead = response.json()
        job = await execute(wire, lead["pending_analysis_id"])
        assert job.state == "complete"
        contexts.append(session(wire.calls[-1]))
        current = (await client.get(path)).json()
        assert (
            current["title"] == "Human title" and not current["requirements_must_have"]
        )
        assert current["source_text"] == SOURCE
    assert len(wire.calls) == 2 and len(set(contexts)) == 2


async def test_direct_application_queues_preparing_with_same_review_contract(
    client, wire
):
    response = await client.post(
        "/api/applications/extract", json={"text": SOURCE, "status_id": wire.status_id}
    )
    assert response.status_code == 201, response.text
    assert not wire.calls
    application = response.json()
    assert (
        application["status"]["meaning"] == "preparing"
        and application["applied_at"] is None
    )
    job = await execute(wire, application["pending_analysis_id"])
    assert job.state == "complete" and len(wire.calls) == 1
    assert session(wire.calls[0]) == job.id
    analysis = (
        await client.get("/api/job-analyses/" + application["pending_analysis_id"])
    ).json()
    assert analysis["draft"]["items"][0]["quote"] == "Python required"


@pytest.mark.parametrize(
    ("status", "content"),
    [
        (200, "not JSON"),
        (
            200,
            '{"items":[{"id":"x","field":"must_have","value":"Python","quote":"invented"}]}',
        ),
        (400, ""),
        (429, ""),
        (500, ""),
        (0, ""),
    ],
)
async def test_failed_provider_work_has_one_request_and_no_automatic_retry(
    client, wire, status, content
):
    lead = (
        await client.post(
            "/api/job-leads", json={"text": SOURCE, "title": "Human title"}
        )
    ).json()
    wire.replies.append((status, content))
    response = await client.post(
        f"/api/job-leads/{lead['id']}/extract", json={"expected_revision": 0}
    )
    assert response.status_code == 200, response.text
    job = await execute(wire, response.json()["pending_analysis_id"])
    assert job.state == "failed" and len(wire.calls) == 1
    current = (await client.get(f"/api/job-leads/{lead['id']}")).json()
    assert current["title"] == "Human title" and not current["confirmed_requirements"]
    assert session(wire.calls[0]) == job.id
