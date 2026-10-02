"""Real LiteLLM/SDK wire contracts on an offline loopback provider."""

import json
import logging
import socket
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models import ApplicationStatus, User
from app.schemas.ai_settings import AISettingsUpdate
from app.services.ai_settings import update_ai_settings

MODEL = "openai/go/deepseek-v4.1-flash"
URL = "https://jobs.example/session-contract"
SOURCE = "Engineer at Synthetic Company. Python required. Salary/date not supplied."
OUTPUT = json.dumps(
    {
        "title": "Engineer",
        "company": "Synthetic Company",
        "location": "Remote",
        "skills": ["Python"],
        "salary_min": None,
        "salary_max": None,
        "salary_currency": None,
        "posted_date": None,
    }
)
INVALID_SCHEMA = '{"title":"Engineer","salary_min":200,"salary_max":100}'


@pytest.fixture
async def wire(client, db, db_engine, monkeypatch, caplog):
    calls = []
    replies = deque()
    # Match real requests: each gets a fresh session, not stale ORM identities
    # from the test client's shared session after an HTTPException.
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def get_session():
        async with sessions() as session:
            yield session

    old_override = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = get_session
    # Alembic fileConfig disables existing loggers. Restore these for actual
    # capture, and require an owner log witness instead of an empty-log check.
    for name in (
        "app.services.extraction",
        "LiteLLM",
        "LiteLLM Router",
        "LiteLLM Proxy",
        "openai",
        "httpx",
        "httpcore",
    ):
        monkeypatch.setattr(logging.getLogger(name), "disabled", False)
    caplog.set_level(logging.DEBUG, logger="app.services.extraction")
    root = logging.getLogger()
    added_handler = caplog.handler not in root.handlers
    if added_handler:
        root.addHandler(caplog.handler)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            calls.append((self.path, self.headers, body))
            status, content = replies.popleft() if replies else (200, OUTPUT)
            if status == 0:
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            if status == 200:
                response = {
                    "id": "chatcmpl-offline",
                    "object": "chat.completion",
                    "created": 0,
                    "model": "go/deepseek-v4.1-flash",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": content},
                            "finish_reason": "stop",
                        }
                    ],
                }
            else:
                response = {
                    "error": {
                        "message": "Offline rejection",
                        "type": "invalid_request_error",
                    }
                }
            data = json.dumps(response).encode()
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
        owner = User(email="session-wire@synthetic.test", password_hash="unused")
        db.add(owner)
        await db.flush()
        applied = ApplicationStatus(name="Applied", meaning="applied", user_id=owner.id)
        db.add(applied)
        await db.commit()
        client.headers["Authorization"] = "Bearer " + create_access_token(
            {"sub": owner.id, "session_version": owner.session_version}
        )
        await update_ai_settings(
            db,
            AISettingsUpdate(
                litellm_model=MODEL,
                litellm_api_key="synthetic-wire-key",
                litellm_base_url=f"http://127.0.0.1:{server.server_port}/v1",
                text_protocol="responses",
            ),
        )
        yield SimpleNamespace(calls=calls, replies=replies, status_id=applied.id)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive()
        app.dependency_overrides[get_db] = old_override
        if added_handler:
            root.removeHandler(caplog.handler)


def session(call):
    path, headers, body = call
    assert path == "/v1/chat/completions"
    values = headers.get_all("x-opencode-session")
    assert values is not None and len(values) == 1, (
        "Missing single session header on actual SDK request"
    )
    value = values[0]
    parsed = UUID(value)
    assert parsed.version == 4 and str(parsed) == value
    assert headers["Authorization"] == "Bearer synthetic-wire-key"
    assert "opencode" not in headers.get("User-Agent", "").lower()
    assert body["model"] == "go/deepseek-v4.1-flash"
    assert body["response_format"] == {"type": "json_object"}
    assert set(body) == {"model", "messages", "response_format"}
    assert body["messages"][0]["role"] == "system"
    assert body["messages"][1] == {
        "role": "user",
        "content": f"Source URL: {URL}\n\nJob Posting Content:\n{SOURCE}",
    }
    assert value not in json.dumps(body)
    return value


async def saved_manual_lead(client, wire):
    saved = await client.post("/api/job-leads", json={"url": URL, "text": SOURCE})
    assert saved.status_code == 201, saved.text
    lead = saved.json()
    assert lead["status"] == "pending" and not wire.calls
    path = "/api/job-leads/" + lead["id"]
    edited = await client.patch(
        path,
        json={
            "expected_revision": 0,
            "title": "Human reviewed",
            "location": None,
            "skills": [],
        },
    )
    assert edited.status_code == 200, edited.text
    assert not wire.calls
    return path, edited.json()


async def test_saved_lead_wire_context_is_per_attempt_and_manual_fields_survive(
    client, wire, caplog
):
    path, lead = await saved_manual_lead(client, wire)
    contexts = []
    for _ in range(2):
        result = await client.post(
            path + "/extract", json={"expected_revision": lead["revision"]}
        )
        assert result.status_code == 200, result.text
        lead = result.json()
        contexts.append(session(wire.calls[-1]))
        assert lead["status"] == "extracted" and lead["processing_started_at"] is None
        assert lead["source_text"] == SOURCE and lead["title"] == "Human reviewed"
        assert lead["company"] == "Synthetic Company"
        assert lead["location"] is None and lead["skills"] == []
        assert all(
            lead[name] is None
            for name in ["salary_min", "salary_max", "salary_currency", "posted_date"]
        )
        assert contexts[-1] not in result.text
    assert len(wire.calls) == 2 and len(set(contexts)) == 2
    records = "\n".join(record.getMessage() for record in caplog.records)
    assert "Starting LLM extraction with model:" in records
    assert all(value not in records for value in contexts)


@pytest.mark.parametrize(
    "bad_content", ["not JSON", INVALID_SCHEMA], ids=["json", "schema"]
)
async def test_direct_application_repair_keeps_context(
    client, wire, caplog, bad_content
):
    wire.replies.extend([(200, bad_content), (200, OUTPUT)])
    data = {"url": URL, "text": SOURCE, "status_id": wire.status_id}
    result = await client.post("/api/applications/extract", json=data)
    assert result.status_code == 201, result.text
    assert len(wire.calls) == 2
    first, repair = map(session, wire.calls)
    assert first == repair
    assert [message["role"] for message in wire.calls[1][2]["messages"]] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert wire.calls[1][2]["messages"][2]["content"] == bad_content
    assert result.json()["salary_min"] is None and result.json()["salary_max"] is None
    assert first not in result.text
    next_result = await client.post("/api/applications/extract", json=data)
    assert next_result.status_code == 201, next_result.text
    assert len(wire.calls) == 3 and session(wire.calls[2]) != first
    records = "\n".join(record.getMessage() for record in caplog.records)
    assert "Starting LLM extraction with model:" in records
    assert first not in records


@pytest.mark.parametrize(
    ("status", "content"),
    [
        (200, "not JSON"),
        (200, INVALID_SCHEMA),
        (400, ""),
        (429, ""),
        (500, ""),
        (0, ""),
    ],
    ids=["json", "schema", "bad-request", "rate-limit", "server-error", "disconnect"],
)
async def test_saved_lead_failure_makes_one_wire_request(client, wire, status, content):
    path, _ = await saved_manual_lead(client, wire)
    wire.replies.append((status, content))
    result = await client.post(path + "/extract", json={"expected_revision": 1})
    assert result.status_code in {502, 504}, result.text
    assert len(wire.calls) == 1
    context = session(wire.calls[0])
    current = await client.get(path)
    lead = current.json()
    assert lead["status"] == "failed" and lead["revision"] == 3
    assert lead["processing_started_at"] is None and lead["source_text"] == SOURCE
    assert (
        lead["title"] == "Human reviewed"
        and lead["location"] is None
        and lead["skills"] == []
    )
    assert context not in current.text and context not in result.text
