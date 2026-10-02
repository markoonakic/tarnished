"""Installation settings, privacy and concurrent database updates."""

import asyncio
from unittest.mock import Mock

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.security import create_access_token, encrypt_api_key
from app.models import SystemSettings, User
from app.schemas.ai_settings import AISettingsUpdate
from app.services.ai_settings import (
    LOCK_KEY,
    get_ai_settings,
    update_ai_settings,
)


async def test_revision_effective_changes_and_independent_capabilities(db):
    initial = await get_ai_settings(db)
    assert initial.revision == initial.speech.revision == "0"
    assert not initial.is_configured
    unchanged = await update_ai_settings(
        db, AISettingsUpdate(text_enabled=True, speech_enabled=False)
    )
    assert unchanged.revision == unchanged.speech.revision == "0"
    explicit = await update_ai_settings(
        db, AISettingsUpdate(litellm_model="openai/gpt-4o-mini")
    )
    assert explicit.model == "openai/gpt-4o-mini" and explicit.revision == "0"
    assert (await get_ai_settings(db)).model == explicit.model
    configured = await update_ai_settings(
        db, AISettingsUpdate(litellm_api_key="synthetic-text-canary")
    )
    assert configured.is_configured and configured.revision != "0"
    assert configured.speech.revision == "0"
    same = await update_ai_settings(
        db, AISettingsUpdate(litellm_api_key="synthetic-text-canary")
    )
    assert same.revision == configured.revision
    speech = await update_ai_settings(
        db,
        AISettingsUpdate(
            speech_enabled=True,
            speech_provider="openai",
            speech_model="whisper-1",
            speech_api_key="synthetic-speech-canary",
            speech_endpoint="http://localhost:4000/v1",
        ),
    )
    assert speech.revision == configured.revision
    assert speech.speech.revision != "0"
    assert speech.speech.is_configured
    assert speech.speech.disclosure().available
    assert speech.speech.disclosure().dispatch_supported
    assert not speech.disclosure().verified
    changed = await update_ai_settings(
        db, AISettingsUpdate(litellm_api_key="replacement-canary")
    )
    assert changed.revision != configured.revision
    assert changed.speech.revision == speech.speech.revision
    cleared = await update_ai_settings(db, AISettingsUpdate(litellm_api_key=None))
    assert cleared.revision != changed.revision and not cleared.is_configured
    assert (
        await update_ai_settings(db, AISettingsUpdate(litellm_api_key=None))
    ).revision == cleared.revision
    values = (await db.execute(select(SystemSettings.value))).scalars().all()
    assert "synthetic-speech-canary" not in values
    assert "synthetic-speech-canary" not in repr(cleared)


async def test_disabled_keyless_and_unsupported_are_not_missing_secret_fallback(db):
    state = await update_ai_settings(db, AISettingsUpdate(text_keyless=True))
    assert not state.is_configured
    state = await update_ai_settings(
        db, AISettingsUpdate(litellm_base_url="http://127.0.0.1:4000/v1")
    )
    assert state.is_configured and state.dispatch_api_key == "tarnished-keyless"
    state = await update_ai_settings(db, AISettingsUpdate(text_enabled=False))
    assert state.disclosure().configuration_status == "disabled"
    with pytest.raises(ValueError, match="Disabled"):
        _ = state.dispatch_api_key
    state = await update_ai_settings(
        db, AISettingsUpdate(text_enabled=True, litellm_model="not-a-provider/model")
    )
    assert state.disclosure().configuration_status == "unsupported"
    with pytest.raises(ValueError, match="unsupported"):
        _ = state.dispatch_api_key


async def test_first_save_concurrent_merges_and_revisions(db_engine):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async def save(**values):
        async with sessions() as session:
            return await update_ai_settings(session, AISettingsUpdate(**values))

    await asyncio.gather(
        save(litellm_api_key="key-canary"),
        save(litellm_model="openai/gpt-4o"),
        save(speech_provider="openai"),
        save(speech_model="whisper-1"),
    )
    async with sessions() as session:
        state = await get_ai_settings(session)
    assert state.api_key == "key-canary" and state.model == "openai/gpt-4o"
    assert state.speech.provider == "openai" and state.speech.model == "whisper-1"
    results = await asyncio.gather(
        *(save(litellm_api_key="key-canary") for _ in range(4))
    )
    assert {result.revision for result in results} == {state.revision}


async def test_coherent_readers_and_writer_lock_waits_before_snapshot(db_engine):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as initial:
        before = await update_ai_settings(
            initial,
            AISettingsUpdate(
                litellm_model="openai/gpt-4o", litellm_api_key="old-canary"
            ),
        )
    async with sessions() as writer, sessions() as reader:
        # Load identity-map records deliberately: readers must not reuse stale ORM values.
        records = (await reader.execute(select(SystemSettings))).scalars().all()
        await reader.commit()
        await writer.execute(
            update(SystemSettings)
            .where(SystemSettings.key == LOCK_KEY)
            .values(value="lock")
        )
        await writer.execute(
            update(SystemSettings)
            .where(SystemSettings.key == "litellm_model")
            .values(value="openai/gpt-4o-mini")
        )
        state = await get_ai_settings(reader)
        assert (
            state.model == before.model
            and state.api_key == before.api_key
            and state.revision == before.revision
        )
        await reader.commit()
        entered = asyncio.Event()

        async def waiting_save():
            async with sessions() as waiting:
                entered.set()
                return await update_ai_settings(
                    waiting, AISettingsUpdate(text_keyless=True)
                )

        task = asyncio.create_task(waiting_save())
        await entered.wait()
        await asyncio.sleep(0.1)
        assert not task.done(), "Writer bypassed the transaction lock"
        await writer.execute(
            update(SystemSettings)
            .where(SystemSettings.key == "litellm_api_key")
            .values(value=encrypt_api_key("new-canary"))
        )
        await writer.execute(
            update(SystemSettings)
            .where(SystemSettings.key == "text_revision")
            .values(value="committed-revision")
        )
        await writer.commit()
        saved = await asyncio.wait_for(task, 10)
        assert saved.model == "openai/gpt-4o-mini" and saved.api_key == "new-canary"
        assert saved.keyless and saved.revision not in {
            before.revision,
            "committed-revision",
        }
        after = await get_ai_settings(reader)
        assert after == saved
        assert records  # Keep stale identity-map objects alive throughout the proof.


async def test_api_authority_privacy_no_dispatch_and_validation(
    client, db, monkeypatch
):
    from app.services import extraction, insights

    completion = Mock(side_effect=AssertionError("No provider calls authorized"))
    monkeypatch.setattr(extraction, "completion", completion)
    monkeypatch.setattr(insights, "completion", completion)
    admin = User(
        email="cap-admin@synthetic.test", password_hash="unused", is_admin=True
    )
    ordinary = User(email="cap-user@synthetic.test", password_hash="unused")
    db.add_all([admin, ordinary])
    await db.commit()

    def headers(user):
        return {
            "Authorization": "Bearer "
            + create_access_token(
                {"sub": user.id, "session_version": user.session_version}
            )
        }

    assert (await client.get("/api/ai-capabilities")).status_code == 401
    payload = {
        "litellm_api_key": "text-secret-canary-9876",
        "litellm_base_url": "https://user:password-canary@example.invalid/path-secret?token=query-canary",
        "speech_enabled": True,
        "speech_provider": "openai",
        "speech_model": "whisper-1",
        "speech_api_key": "speech-secret-canary-5432",
        "speech_endpoint": "http://localhost:4000/speech-path-canary",
    }
    saved = await client.put(
        "/api/admin/ai-settings", headers=headers(admin), json=payload
    )
    assert saved.status_code == 200, saved.text
    for response in [
        saved,
        await client.get("/api/admin/ai-settings", headers=headers(admin)),
        await client.get("/api/ai-capabilities", headers=headers(ordinary)),
    ]:
        assert response.status_code == 200
        for secret in [
            "9876",
            "5432",
            "password-canary",
            "path-secret",
            "query-canary",
            "speech-path-canary",
            "example.invalid",
            "localhost:4000",
        ]:
            assert secret not in response.text
        data = response.json()
        assert not data["text"]["verified"] and not data["speech"]["verified"]
        assert data["speech"]["available"]
    for method in ["get", "put"]:
        kwargs = {"json": payload} if method == "put" else {}
        denied = await getattr(client, method)(
            "/api/admin/ai-settings", headers=headers(ordinary), **kwargs
        )
        assert denied.status_code == 403
    for invalid in [
        {"speech_api_key": {"nested": "secret-canary"}},
        {"speech_endpoint": "secret-canary"},
        {"secret-canary": "unknown"},
        {"text_enabled": None},
    ]:
        response = await client.put(
            "/api/admin/ai-settings", headers=headers(admin), json=invalid
        )
        assert response.status_code == 422
        assert "secret-canary" not in response.text
    # Existing generation consumer must not call with disabled settings.
    await update_ai_settings(db, AISettingsUpdate(text_enabled=False))
    response = await client.post(
        "/api/analytics/insights", headers=headers(ordinary), json={"period": "30d"}
    )
    assert response.status_code == 400 and "Disabled" in response.text
    completion.assert_not_called()


async def test_failed_transaction_keeps_values_and_revisions(db, monkeypatch):
    before = await update_ai_settings(
        db, AISettingsUpdate(litellm_api_key="old-canary")
    )

    async def fail_commit():
        raise RuntimeError("synthetic commit failure")

    with monkeypatch.context() as patch:
        patch.setattr(db, "commit", fail_commit)
        with pytest.raises(RuntimeError):
            await update_ai_settings(
                db, AISettingsUpdate(litellm_api_key="new-canary", speech_enabled=True)
            )
    await db.rollback()
    assert await get_ai_settings(db) == before


async def test_personal_transfer_excludes_installation_settings(db):
    import json

    from app.services.export_registry import default_registry
    from app.services.export_service import ExportService
    from app.services.import_execution import import_payload_data

    owner = User(
        email="transfer-cap@synthetic.test",
        password_hash="unused",
        settings={
            "speech_api_key": "legacy-private-canary",
            "speech_endpoint": "legacy-endpoint-canary",
            "text_enabled": False,
        },
    )
    other = User(email="transfer-cap-other@synthetic.test", password_hash="unused")
    db.add_all([owner, other])
    await db.commit()
    before = await update_ai_settings(
        db,
        AISettingsUpdate(
            litellm_api_key="installation-text-canary",
            speech_api_key="installation-speech-canary",
            speech_endpoint="http://localhost:4000/private-endpoint-canary",
        ),
    )
    archive = await db.run_sync(
        lambda session: ExportService(default_registry).export_user_data(
            owner.id, session
        )
    )
    assert "canary" not in json.dumps(archive)
    assert "SystemSettings" not in archive["models"]
    await import_payload_data(db, other.id, archive, {}, lambda **kwargs: None)
    await db.commit()
    assert await get_ai_settings(db) == before
    archive["models"]["SystemSettings"] = [
        {"key": "speech_api_key", "value": "injected-canary"}
    ]
    third = User(email="transfer-cap-third@synthetic.test", password_hash="unused")
    db.add(third)
    await db.commit()
    # Unregistered models are ignored, never granted installation write authority.
    await import_payload_data(db, third.id, archive, {}, lambda **kwargs: None)
    await db.commit()
    assert await get_ai_settings(db) == before


async def test_consumer_keyless_contract_and_provider_error_secret_boundary(
    db, monkeypatch, caplog
):
    from app.services import extraction, insights

    state = await update_ai_settings(
        db,
        AISettingsUpdate(
            text_keyless=True, litellm_base_url="http://localhost:4000/endpoint-canary"
        ),
    )
    completion = Mock(
        side_effect=RuntimeError("provider-secret-canary endpoint-canary")
    )
    monkeypatch.setattr(extraction, "completion", completion)
    monkeypatch.setattr(insights, "completion", completion)
    with pytest.raises(extraction.ExtractionInvalidResponseError) as exc:
        extraction.extract_with_llm(
            "Synthetic job",
            "https://jobs.invalid/one",
            model=state.model,
            api_key=state.dispatch_api_key,
            api_base=state.base_url,
            retry_invalid_response=False,
        )
    assert "canary" not in str(exc.value)
    assert completion.call_args.kwargs["api_key"] == "tarnished-keyless"
    assert completion.call_args.kwargs["api_base"] == state.base_url
    with pytest.raises(ValueError) as exc:
        insights.generate_insights_from_settings(state, {}, {}, {}, "30d")
    assert "canary" not in str(exc.value)
    assert completion.call_args.kwargs["api_key"] == "tarnished-keyless"
    assert "canary" not in caplog.text


async def test_settings_admin_key_scopes_and_revoked_authority(client, db):
    admin = User(
        email="scoped-cap@synthetic.test", password_hash="unused", is_admin=True
    )
    db.add(admin)
    await db.commit()
    session_headers = {
        "Authorization": "Bearer "
        + create_access_token(
            {"sub": admin.id, "session_version": admin.session_version}
        )
    }
    created = await client.post(
        "/api/settings/api-keys",
        headers=session_headers,
        json={"label": "Capability read", "preset": "custom", "scopes": ["admin:read"]},
    )
    assert created.status_code == 201, created.text
    key_data = created.json()
    key_headers = {"X-API-Key": key_data["api_key"]}
    assert (
        await client.get("/api/admin/ai-settings", headers=key_headers)
    ).status_code == 200
    assert (
        await client.get("/api/ai-capabilities", headers=key_headers)
    ).status_code == 200
    assert (
        await client.put(
            "/api/admin/ai-settings", headers=key_headers, json={"speech_enabled": True}
        )
    ).status_code == 403
    await client.delete(
        "/api/settings/api-keys/" + key_data["id"], headers=session_headers
    )
    assert (
        await client.get("/api/ai-capabilities", headers=key_headers)
    ).status_code == 401
    admin.is_active = False
    await db.commit()
    assert (
        await client.get("/api/ai-capabilities", headers=session_headers)
    ).status_code == 403


def test_sensitive_driver_logging_is_not_enabled_by_debug_default():
    import logging

    from app.core.database import engine

    assert engine.sync_engine.hide_parameters
    for name in ("aiosqlite", "httpx", "httpcore", "openai"):
        assert not logging.getLogger(name).isEnabledFor(logging.DEBUG)


async def test_every_capability_field_rotates_only_its_revision(db):
    previous = await get_ai_settings(db)
    changes = {
        "litellm_model": "openai/gpt-4o",
        "litellm_api_key": "text-canary",
        "litellm_base_url": "http://localhost:4000/text",
        "text_protocol": "responses",
        "text_enabled": False,
        "text_keyless": True,
        "speech_enabled": True,
        "speech_provider": "openai",
        "speech_model": "whisper-1",
        "speech_endpoint": "http://localhost:4000/speech",
        "speech_api_key": "speech-canary",
        "speech_keyless": True,
    }
    for key, value in changes.items():
        current = await update_ai_settings(
            db, AISettingsUpdate.model_validate({key: value})
        )
        if key.startswith("speech_"):
            assert current.speech.revision != previous.speech.revision, key
            assert current.revision == previous.revision, key
        else:
            assert current.revision != previous.revision, key
            assert current.speech.revision == previous.speech.revision, key
        unchanged = await update_ai_settings(
            db, AISettingsUpdate.model_validate({key: value})
        )
        assert unchanged == current, key
        previous = current
