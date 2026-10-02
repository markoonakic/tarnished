"""No-download route/setup contracts. These are NOT model inference tests."""

import hashlib
import importlib.util
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from tests.test_transcription_jobs import audio_bytes, speech_fixture

from app.core.security import create_access_token
from app.models import User
from app.schemas.ai_settings import AISettingsUpdate
from app.services.ai_settings import CapabilitySettingsState, update_ai_settings
from app.services.local_speech import (
    LOCAL_MODEL,
    LOCAL_MODELS,
    inspect_local_speech,
    is_local_endpoint,
)
from app.services.speech_openai import transcribe_chunk

BASE_MODEL = "Systran/faster-whisper-base.en"


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://speaches:8000/v1",
        "http://127.0.0.1:8000/v1",
        "http://192.168.1.2:8000/v1",
        "http://localhost:8000/v1/",
    ],
)
def test_local_endpoint(endpoint):
    assert is_local_endpoint(endpoint)


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://api.openai.com/v1",
        "http://8.8.8.8/v1",
        "http://speaches.evil.test/v1",
        "http://speaches/v1?token=secret",
        "http://user:secret@speaches/v1",
        "http://speaches/v1#fragment",
        "http://0.0.0.0/v1",
        "http://169.254.169.254/v1",
        "http://speaches:bad/v1",
        "http://speaches/other",
    ],
)
def test_local_rejects_public_or_credential_routes(endpoint):
    assert not is_local_endpoint(endpoint)


@pytest.mark.parametrize(
    "provider,model,keyless,status",
    [
        ("local", LOCAL_MODEL, True, "configured"),
        ("local", BASE_MODEL, True, "configured"),
        ("local", "whisper-1", True, "unsupported"),
        ("local", "Systran/faster-whisper-small.en", True, "unsupported"),
        ("local", "Systran/faster-whisper-large-v3", True, "unsupported"),
        ("local", "arbitrary/model", True, "unsupported"),
        ("local", "../model", True, "unsupported"),
        ("local", LOCAL_MODEL, False, "unsupported"),
        ("openai", LOCAL_MODEL, True, "unsupported"),
        ("openai", "whisper-1", True, "configured"),
    ],
)
def test_local_model_allowlist_does_not_weaken_cloud(provider, model, keyless, status):
    state = CapabilitySettingsState(
        model,
        None,
        "http://speaches:8000/v1",
        kind="speech",
        provider=provider,
        keyless=keyless,
    )
    assert state.configuration_status == status
    assert state.disclosure().verified is False


def test_curated_allowlist_is_exactly_two_english_models():
    assert LOCAL_MODELS == (LOCAL_MODEL, BASE_MODEL)


async def test_local_save_clears_old_speech_secret_not_text(db):
    first = await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_api_key="text-canary",
            speech_api_key="speech-canary",
            speech_provider="openai",
        ),
    )
    state = await update_ai_settings(
        db,
        AISettingsUpdate(
            speech_provider="local",
            speech_model=BASE_MODEL,
            speech_endpoint="http://speaches:8000/v1",
            speech_keyless=True,
            speech_enabled=True,
        ),
    )
    assert state.speech.api_key is None
    assert state.api_key == "text-canary"
    assert state.revision == first.revision
    assert state.speech.is_configured
    state = await update_ai_settings(
        db, AISettingsUpdate(speech_api_key="new-unused-canary")
    )
    assert state.speech.api_key is None


async def test_settings_get_save_and_model_selection_never_contact_service(
    client, db, monkeypatch
):
    network = AsyncMock(side_effect=AssertionError("No implicit service request"))
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", network)
    admin = User(
        email="local-admin@synthetic.test", password_hash="unused", is_admin=True
    )
    db.add(admin)
    await db.commit()
    headers = {
        "Authorization": "Bearer "
        + create_access_token(
            {"sub": admin.id, "session_version": admin.session_version}
        )
    }
    response = await client.put(
        "/api/admin/ai-settings",
        headers=headers,
        json={
            "speech_provider": "local",
            "speech_model": LOCAL_MODEL,
            "speech_keyless": True,
            "speech_enabled": True,
            "speech_endpoint": "http://speaches:8000/v1",
        },
    )
    assert response.status_code == 200
    for path in ("/api/admin/ai-settings", "/api/ai-capabilities"):
        assert (await client.get(path, headers=headers)).status_code == 200
    network.assert_not_called()
    assert (
        await client.get("/api/admin/ai-settings/local-speech-status")
    ).status_code == 401
    user = User(email="local-user@synthetic.test", password_hash="unused")
    db.add(user)
    await db.commit()
    user_headers = {
        "Authorization": "Bearer "
        + create_access_token({"sub": user.id, "session_version": user.session_version})
    }
    assert (
        await client.get(
            "/api/admin/ai-settings/local-speech-status", headers=user_headers
        )
    ).status_code == 403
    network.assert_not_called()


@pytest.mark.parametrize(
    "body,status,installed",
    [
        (b'{"data":[]}', "not_installed", []),
        (
            '{"data":[{"id":"' + LOCAL_MODEL + '"}]}',
            "installed_unvalidated",
            [LOCAL_MODEL],
        ),
        (
            '{"data":[{"id":"' + BASE_MODEL + '"},{"id":"' + LOCAL_MODEL + '"}]}',
            "installed_unvalidated",
            [LOCAL_MODEL, BASE_MODEL],
        ),
        (b'{"data":[{"id":"some/uncurated"}]}', "not_installed", []),
        (b'{"data":[1]}', "error", []),
        (b"x" * 65537, "error", []),
    ],
)
async def test_explicit_status_only_lists_cache(monkeypatch, body, status, installed):
    calls = []

    async def handle(_self, request):
        calls.append(request)
        return httpx.Response(200, content=body, request=request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", handle)
    result = await inspect_local_speech("http://speaches:8000/v1")
    assert result["status"] == status
    assert result["installed"] == installed
    assert len(calls) == 1
    assert calls[0].method == "GET"
    assert str(calls[0].url) == "http://speaches:8000/v1/models"
    assert "authorization" not in calls[0].headers


async def test_unavailable_status_sanitizes_private_details(monkeypatch):
    async def fail(_self, request):
        raise httpx.ConnectError("private-canary", request=request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fail)
    result = await inspect_local_speech("http://speaches:8000/v1")
    assert result["status"] == "unavailable"
    assert result["installed"] == []
    assert "canary" not in str(result)


async def test_local_reuses_real_sdk_keyless_private_http_contract(
    tmp_path, monkeypatch
):
    # Actual loopback HTTP + installed SDK, but a canned contract response, NOT inference.
    monkeypatch.setenv("OPENAI_API_KEY", "ambient-canary")
    path = tmp_path / "contract.wav"
    path.write_bytes(audio_bytes())
    async with speech_fixture() as (endpoint, calls):
        state = CapabilitySettingsState(
            BASE_MODEL, None, endpoint, provider="local", kind="speech", keyless=True
        )
        assert (
            await transcribe_chunk(state, path)
        ).text == "Synthetic contract passage"
    assert len(calls) == 1
    headers, body = calls[0]
    assert b"authorization:" not in headers.lower()
    assert BASE_MODEL.encode() in body
    assert b"whisper-1" not in body


@pytest.fixture
def setup_script():
    path = Path(__file__).resolve().parents[3] / "deploy/compose/setup-local-speech.py"
    spec = importlib.util.spec_from_file_location("setup_local_speech", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_setup_pins_both_curated_models(setup_script):
    tiny = setup_script.MODELS[LOCAL_MODEL]
    base = setup_script.MODELS[BASE_MODEL]
    assert sum(size for size, _ in tiny["manifest"].values()) == 78093394
    assert sum(size for size, _ in base["manifest"].values()) == 147772310
    assert (
        tiny["manifest"]["model.bin"][1]
        == "1a5afae06a4db91c975c9a9d78be5cc110ee4ea022ad57d55492e4550e936b2a"
    )
    assert (
        base["manifest"]["model.bin"][1]
        == "2a166925539a16005f14ff328359f9b9adb9dc4fb631bb3b227526862e93e2ef"
    )
    assert tiny["revision"] == setup_script.REVISION
    assert base["revision"] == "3d3d5dee26484f91867d81cb899cfcf72b96be6c"
    assert len(setup_script.MODELS) == 2
    with pytest.raises(ValueError, match="No curated model"):
        setup_script.verify_cache(Path(setup_script.__file__).resolve().parent)


def test_setup_attests_real_vad_assets_not_legacy_name(setup_script):
    # The pinned image ships encoder/decoder, NOT the older silero_vad_v5.onnx.
    assert set(setup_script.VAD_ASSETS) == {
        "silero_encoder_v5.onnx",
        "silero_decoder_v5.onnx",
    }
    assert "silero_vad_v5.onnx" not in setup_script.VAD_ASSETS
    for size, digest in setup_script.VAD_ASSETS.values():
        assert size > 0 and len(digest) == 64


def test_setup_integrity_before_main_init_and_no_overwrite(
    setup_script, tmp_path, monkeypatch
):
    # Tiny unit-only byte fixture with a patched spec; never passed to a model runtime.
    data = b"unit-only-verifier-fixture"
    monkeypatch.setattr(
        setup_script,
        "MODELS",
        {
            "unit/model": {
                "revision": "a" * 40,
                "repository": "models--unit--model",
                "manifest": {
                    "config.json": (
                        len(data),
                        hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest(),
                    )
                },
            }
        },
    )
    repo = tmp_path / "models--unit--model"
    snapshot = repo / "snapshots" / ("a" * 40)
    snapshot.mkdir(parents=True)
    file = snapshot / "config.json"
    file.write_bytes(b"wrong")
    with pytest.raises(ValueError):
        setup_script.verify_model(tmp_path, "unit/model", initialize=True)
    assert not (repo / "refs/main").exists()
    file.write_bytes(data)
    assert (
        setup_script.verify_model(tmp_path, "unit/model", initialize=True)["status"]
        == "installed_unvalidated"
    )
    main = repo / "refs/main"
    assert main.read_bytes() == ("a" * 40).encode()
    assert main.stat().st_size == 40
    main.write_text("different")
    with pytest.raises(ValueError, match="overwrite"):
        setup_script.verify_model(tmp_path, "unit/model", initialize=True)
    assert main.read_text() == "different"


def test_setup_rejects_unexpected_repository_in_dedicated_cache(
    setup_script, tmp_path, monkeypatch
):
    monkeypatch.setattr(setup_script, "MODELS", {})
    (tmp_path / "models--other--thing").mkdir()
    with pytest.raises(ValueError, match="Unexpected repository"):
        setup_script.verify_cache(tmp_path)


def test_setup_cache_ownership_matches_image_runtime_uid(
    setup_script, tmp_path, monkeypatch
):
    cache = tmp_path / "hub"
    # Same uid as the service: a private cache, no chown.
    monkeypatch.setattr(setup_script.os, "getuid", lambda: 1000)
    setup_script.prepare_cache(cache, (1000, 1000))
    assert cache.is_dir()
    assert (cache.stat().st_mode & 0o777) == 0o700
    assert not cache.is_symlink()

    # Different non-root operator: refuse instead of creating an unreadable cache.
    other = tmp_path / "hub2"
    monkeypatch.setattr(setup_script.os, "getuid", lambda: 4242)
    with pytest.raises(PermissionError, match="unreadable by the service"):
        setup_script.prepare_cache(other, (1000, 1000))
    assert not other.exists()

    # Root: align the dedicated cache to the service identity.
    aligned = tmp_path / "hub3"
    chowned = []
    monkeypatch.setattr(setup_script.os, "getuid", lambda: 0)
    monkeypatch.setattr(
        setup_script.os, "chown", lambda path, uid, gid: chowned.append((uid, gid))
    )
    setup_script.prepare_cache(aligned, (1000, 1000))
    assert aligned.is_dir()
    assert chowned == [(1000, 1000)]
