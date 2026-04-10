from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models import (
    Application,
    ApplicationStatus,
    Round,
    RoundMedia,
    RoundType,
    User,
)


@pytest.fixture
async def cleanup_user(db: AsyncSession) -> User:
    user = User(
        email="cleanup@example.com",
        password_hash=get_password_hash("testpass123"),
        is_active=True,
        is_admin=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def cleanup_status(db: AsyncSession, cleanup_user: User) -> ApplicationStatus:
    status = ApplicationStatus(
        name="Applied",
        normalized_name="applied",
        color="#83a598",
        is_default=False,
        user_id=cleanup_user.id,
        order=1,
    )
    db.add(status)
    await db.commit()
    await db.refresh(status)
    return status


@pytest.fixture
async def cleanup_round_type(db: AsyncSession, cleanup_user: User) -> RoundType:
    round_type = RoundType(
        name="Phone Screen",
        normalized_name="phone screen",
        is_default=False,
        user_id=cleanup_user.id,
    )
    db.add(round_type)
    await db.commit()
    await db.refresh(round_type)
    return round_type


@pytest.mark.asyncio
async def test_build_cleanup_report_classifies_references_orphans_and_suspicious_files(
    db: AsyncSession,
    cleanup_user: User,
    cleanup_status: ApplicationStatus,
    cleanup_round_type: RoundType,
    tmp_path: Path,
):
    from app.services.storage_cleanup import build_cleanup_report

    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    user_upload_dir = upload_root / cleanup_user.id
    user_upload_dir.mkdir()

    referenced_cv_name = "a" * 64 + ".pdf"
    referenced_transcript_name = "b" * 64 + ".pdf"
    orphan_root_name = "c" * 64 + ".pdf"
    orphan_user_name = "d" * 64 + ".mp3"
    missing_name = "e" * 64 + ".pdf"

    referenced_cv_path = upload_root / referenced_cv_name
    referenced_transcript_path = user_upload_dir / referenced_transcript_name
    orphan_root_path = upload_root / orphan_root_name
    orphan_user_path = user_upload_dir / orphan_user_name
    suspicious_path = upload_root / "notes.txt"

    referenced_cv_path.write_bytes(b"cv-bytes")
    referenced_transcript_path.write_bytes(b"transcript-bytes")
    orphan_root_path.write_bytes(b"orphan-root")
    orphan_user_path.write_bytes(b"orphan-user")
    suspicious_path.write_bytes(b"keep-me")

    application = Application(
        user_id=cleanup_user.id,
        company="Cleanup Co",
        job_title="Engineer",
        status_id=cleanup_status.id,
        applied_at=date.today(),
        cv_path=f"uploads/{referenced_cv_name}",
        cover_letter_path=f"uploads/{missing_name}",
    )
    db.add(application)
    await db.commit()
    await db.refresh(application)

    round_obj = Round(
        application_id=application.id,
        round_type_id=cleanup_round_type.id,
        scheduled_at=datetime.now(UTC),
        transcript_path=f"uploads/{cleanup_user.id}/{referenced_transcript_name}",
    )
    db.add(round_obj)
    await db.commit()
    await db.refresh(round_obj)

    media = RoundMedia(
        round_id=round_obj.id,
        file_path=f"uploads/{referenced_cv_name}",
        media_type="audio",
    )
    db.add(media)
    await db.commit()

    report = await build_cleanup_report(db, upload_root=upload_root)

    assert report.upload_root == upload_root.resolve()
    assert referenced_cv_path.resolve() in report.referenced_paths
    assert referenced_transcript_path.resolve() in report.referenced_paths
    assert orphan_root_path.resolve() in report.orphan_paths
    assert orphan_user_path.resolve() in report.orphan_paths
    assert suspicious_path.resolve() in report.suspicious_paths
    assert (upload_root / missing_name).resolve() in report.missing_referenced_paths
    assert report.reclaimable_bytes == len(b"orphan-root") + len(b"orphan-user")


@pytest.mark.asyncio
async def test_delete_orphans_removes_only_cas_files_and_empty_dirs(
    db: AsyncSession,
    cleanup_user: User,
    cleanup_status: ApplicationStatus,
    cleanup_round_type: RoundType,
    tmp_path: Path,
):
    from app.services.storage_cleanup import apply_cleanup, build_cleanup_report

    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    live_dir = upload_root / cleanup_user.id
    orphan_only_dir = upload_root / "stale-user"
    live_dir.mkdir()
    orphan_only_dir.mkdir()

    referenced_name = "f" * 64 + ".pdf"
    orphan_name = "0" * 64 + ".pdf"

    referenced_path = live_dir / referenced_name
    orphan_path = orphan_only_dir / orphan_name
    suspicious_path = upload_root / "README.txt"

    referenced_path.write_bytes(b"referenced")
    orphan_path.write_bytes(b"orphan")
    suspicious_path.write_bytes(b"notes")

    application = Application(
        user_id=cleanup_user.id,
        company="Cleanup Co",
        job_title="Engineer",
        status_id=cleanup_status.id,
        applied_at=date.today(),
        cv_path=f"uploads/{cleanup_user.id}/{referenced_name}",
    )
    db.add(application)
    await db.commit()

    report = await build_cleanup_report(db, upload_root=upload_root)
    deleted_report = apply_cleanup(report, delete=True)

    assert not orphan_path.exists()
    assert referenced_path.exists()
    assert suspicious_path.exists()
    assert not orphan_only_dir.exists()
    assert deleted_report.deleted_paths == [orphan_path.resolve()]
    assert deleted_report.deleted_bytes == len(b"orphan")
