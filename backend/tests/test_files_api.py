from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models import Application, ApplicationStatus, User


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        email="files-api@example.com",
        password_hash=get_password_hash("testpass123"),
        is_active=True,
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict[str, str]:
    token = create_access_token(
        {"sub": test_user.id, "session_version": test_user.session_version}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def status(db: AsyncSession) -> ApplicationStatus:
    status = ApplicationStatus(
        name="Applied",
        color="#83a598",
        is_default=True,
        user_id=None,
        order=1,
    )
    db.add(status)
    await db.commit()
    await db.refresh(status)
    return status


@pytest.mark.asyncio
async def test_file_endpoint_rejects_absolute_paths_outside_upload_dir(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict[str, str],
    status: ApplicationStatus,
    tmp_path: Path,
):
    external_file = tmp_path / "outside.pdf"
    external_file.write_bytes(b"secret")

    application = Application(
        user_id=test_user.id,
        company="Unsafe Paths Inc",
        job_title="Engineer",
        status_id=status.id,
        applied_at=__import__("datetime").date.today(),
        cv_path=str(external_file),
        cv_original_filename="outside.pdf",
    )
    db.add(application)
    await db.commit()
    await db.refresh(application)

    response = await client.get(
        f"/api/files/{application.id}/cv",
        headers=auth_headers,
    )

    assert response.status_code == 404


@pytest.mark.parametrize("document", ["cv", "cover-letter"])
async def test_document_download_encodes_original_filename(
    client, db, test_user, auth_headers, status, tmp_path, monkeypatch, document
):
    from urllib.parse import unquote

    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    (tmp_path / "document.pdf").write_bytes(b"%PDF-1.4\n")
    application = Application(
        user_id=test_user.id,
        company="Example",
        job_title="Engineer",
        status_id=status.id,
        cv_path="uploads/document.pdf",
        cover_letter_path="uploads/document.pdf",
    )
    db.add(application)
    await db.commit()
    field = document.replace("-", "_") + "_original_filename"
    for name in (
        "životopis.pdf",
        'resume"; other="value.pdf',
        "resume\r\nX-Injected: yes.pdf",
    ):
        setattr(application, field, name)
        await db.commit()
        for disposition in ("inline", "attachment"):
            response = await client.get(
                f"/api/files/{application.id}/{document}",
                params={"disposition": disposition},
                headers=auth_headers,
            )
            assert response.status_code == 200
            header = response.headers["content-disposition"]
            assert header.startswith(disposition + "; filename*=utf-8''")
            assert unquote(header.split("''", 1)[1]) == name
            assert "\r" not in header and "\n" not in header
            assert "x-injected" not in response.headers
            assert response.content == b"%PDF-1.4\n"


@pytest.mark.parametrize("file_kind", ["cv", "cover-letter", "media", "transcript"])
async def test_file_download_authority(
    client, db, test_user, auth_headers, status, tmp_path, monkeypatch, file_kind
):
    from datetime import UTC, datetime, timedelta
    from urllib.parse import parse_qs, urlparse

    from jose import jwt

    from app.core.config import get_settings
    from app.core.security import hash_api_key, settings
    from app.models import Round, RoundMedia, RoundType
    from app.models.user_api_key import UserAPIKey

    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    (tmp_path / "attachment.txt").write_bytes(b"owned attachment")
    application = Application(
        user_id=test_user.id,
        company="Owner",
        job_title="Engineer",
        status_id=status.id,
        cv_path="uploads/attachment.txt",
        cover_letter_path="uploads/attachment.txt",
    )
    round_type = RoundType(name="Technical", user_id=None)
    db.add_all([application, round_type])
    await db.flush()
    round_obj = Round(
        application_id=application.id,
        round_type_id=round_type.id,
        transcript_path="uploads/attachment.txt",
    )
    db.add(round_obj)
    await db.flush()
    media = RoundMedia(
        round_id=round_obj.id, file_path="uploads/attachment.txt", media_type="audio"
    )
    other_user = User(
        email="foreign-files@example.com", password_hash="foreign-hash", is_active=True
    )
    db.add_all([media, other_user])
    for raw, scopes in [
        ("restricted", ["applications:read"]),
        ("reader", ["files:read"]),
        ("revoked", ["files:read"]),
    ]:
        db.add(
            UserAPIKey(
                user_id=test_user.id,
                label=raw,
                key_prefix=raw,
                key_hash=hash_api_key(raw),
                scopes=scopes,
                revoked_at=datetime.now(UTC) if raw == "revoked" else None,
            )
        )
    await db.commit()
    path = {
        "cv": f"/api/files/{application.id}/cv",
        "cover-letter": f"/api/files/{application.id}/cover-letter",
        "media": f"/api/files/media/{media.id}",
        "transcript": f"/api/files/rounds/{round_obj.id}/transcript",
    }[file_kind]
    for suffix in ["", "/signed"]:
        denied = await client.get(path + suffix, headers={"X-API-Key": "restricted"})
        assert denied.status_code == 403
        assert "files:read" in denied.json()["detail"]
        foreign = await client.get(
            path + suffix,
            headers={
                "Authorization": f"Bearer {create_access_token({'sub': other_user.id, 'session_version': other_user.session_version})}"
            },
        )
        assert foreign.status_code == 404
    for headers in [auth_headers, {"X-API-Key": "reader"}]:
        direct = await client.get(path, headers=headers)
        assert direct.status_code == 200
        assert direct.content == b"owned attachment"
        signed = await client.get(path + "/signed", headers=headers)
        assert signed.status_code == 200
        download = await client.get(signed.json()["url"])
        assert download.status_code == 200
        assert download.content == b"owned attachment"

    for headers in [{}, {"X-API-Key": "invalid"}, {"X-API-Key": "revoked"}]:
        assert (await client.get(path, headers=headers)).status_code == 401
    assert (await client.get(path, params={"token": "invalid"})).status_code == 401
    # Keep valid JWT fallback even when an invalid URL token is supplied.
    assert (
        await client.get(path, params={"token": "invalid"}, headers=auth_headers)
    ).status_code == 200

    signed = await client.get(path + "/signed", headers=auth_headers)

    token = parse_qs(urlparse(signed.json()["url"]).query)["token"][0]
    payload = jwt.get_unverified_claims(token)
    payload["exp"] = datetime.now(UTC) - timedelta(seconds=1)
    expired = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    assert (await client.get(path, params={"token": expired})).status_code == 401
    payload["exp"] = datetime.now(UTC) + timedelta(minutes=1)
    for key in ("application_id", "media_id", "round_id"):
        if key in payload:
            payload[key] = "another-record"
    mismatched = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    assert (await client.get(path, params={"token": mismatched})).status_code == 403

    # A signed URL is an independent bearer grant, regardless of an incidental
    # restricted header; it must not turn playback into a JWT-only path.
    assert (
        await client.get(signed.json()["url"], headers={"X-API-Key": "restricted"})
    ).status_code == 200

    # Live grant authority: password/session invalidation, disabled users and
    # issuing-key revocation/scope removal apply to every resource kind.
    from sqlalchemy import select

    from app.services.accounts import update_account

    key_signed = (
        await client.get(path + "/signed", headers={"X-API-Key": "reader"})
    ).json()["url"]
    reader = await db.scalar(
        select(UserAPIKey).where(UserAPIKey.key_hash == hash_api_key("reader"))
    )
    reader.revoked_at = datetime.now(UTC)
    await db.commit()
    assert (await client.get(key_signed)).status_code == 401
    assert (await client.get(signed.json()["url"])).status_code == 200
    reader.revoked_at = None
    reader.scopes = ["applications:read"]
    await db.commit()
    assert (await client.get(key_signed)).status_code == 401
    reader.scopes = ["files:read"]
    test_user.is_active = False
    await db.commit()
    assert (await client.get(signed.json()["url"])).status_code == 401
    test_user.is_active = True
    await db.commit()
    for password in ("new file password 123", None):
        await update_account(db, test_user.id, password=password)
        await db.commit()
        assert (await client.get(signed.json()["url"])).status_code == 401
        assert (await client.get(key_signed)).status_code == 401
        # Keys remain independent and can issue fresh links after a reset.
        key_signed = (
            await client.get(path + "/signed", headers={"X-API-Key": "reader"})
        ).json()["url"]
        assert (await client.get(key_signed)).status_code == 200
        await db.refresh(test_user)
        auth_headers = {
            "Authorization": "Bearer "
            + create_access_token(
                {"sub": test_user.id, "session_version": test_user.session_version}
            )
        }
        signed = await client.get(path + "/signed", headers=auth_headers)
    current_payload = jwt.get_unverified_claims(
        parse_qs(urlparse(signed.json()["url"]).query)["token"][0]
    )
    for change in (
        {"exp": []},
        {"exp": True},
        {"session_version": True},
        {"session_version": "0"},
        {"api_key_id": []},
    ):
        malformed = jwt.encode(
            {**current_payload, **change},
            settings.secret_key,
            algorithm=settings.algorithm,
        )
        assert (await client.get(path, params={"token": malformed})).status_code == 401
    del current_payload["session_version"]
    legacy = jwt.encode(
        current_payload, settings.secret_key, algorithm=settings.algorithm
    )
    assert (await client.get(path, params={"token": legacy})).status_code == 401
    assert (
        await client.get(path, params={"token": legacy}, headers=auth_headers)
    ).status_code == 200

    external_file = tmp_path / "outside.txt"
    external_file.write_bytes(b"outside root")
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path / "contained"))
    application.cv_path = application.cover_letter_path = str(external_file)
    round_obj.transcript_path = media.file_path = str(external_file)
    await db.commit()
    assert (await client.get(path, headers=auth_headers)).status_code == 404
    assert (await client.get(signed.json()["url"])).status_code == 404
    test_user.is_active = False
    await db.commit()
    for headers in [auth_headers, {"X-API-Key": "reader"}]:
        assert (await client.get(path, headers=headers)).status_code == 401
