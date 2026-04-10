from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Application, Round, RoundMedia

CAS_BLOB_NAME_RE = re.compile(r"^[0-9a-f]{64}(?:\.[A-Za-z0-9]+)?$")


@dataclass
class StorageCleanupReport:
    upload_root: Path
    referenced_paths: set[Path]
    orphan_paths: list[Path]
    suspicious_paths: list[Path]
    missing_referenced_paths: list[Path]
    reclaimable_bytes: int
    deleted_paths: list[Path] = field(default_factory=list)
    deleted_bytes: int = 0


def _is_cas_blob_file(path: Path) -> bool:
    return CAS_BLOB_NAME_RE.fullmatch(path.name) is not None


def _is_within_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


async def _collect_application_file_references(session: AsyncSession) -> set[str]:
    result = await session.execute(
        select(Application.cv_path, Application.cover_letter_path)
    )
    references: set[str] = set()
    for cv_path, cover_letter_path in result.all():
        if cv_path:
            references.add(cv_path)
        if cover_letter_path:
            references.add(cover_letter_path)
    return references


async def _collect_round_file_references(session: AsyncSession) -> set[str]:
    transcript_result = await session.execute(select(Round.transcript_path))
    media_result = await session.execute(select(RoundMedia.file_path))

    references = {path for path in transcript_result.scalars().all() if path}
    references.update(path for path in media_result.scalars().all() if path)
    return references


def _resolve_stored_path(stored_path: str, upload_root: Path) -> Path:
    path = stored_path
    if path.startswith("./"):
        path = path[2:]
    if path.startswith("uploads/"):
        path = path[8:]

    candidate = Path(path)
    if candidate.is_absolute():
        return candidate.resolve()

    return (upload_root / candidate).resolve()


async def collect_referenced_paths(
    session: AsyncSession, upload_root: Path | None = None
) -> set[Path]:
    root = (upload_root or Path(get_settings().upload_dir)).resolve()
    stored_paths = await _collect_application_file_references(session)
    stored_paths.update(await _collect_round_file_references(session))

    resolved_paths: set[Path] = set()
    for stored_path in stored_paths:
        resolved = _resolve_stored_path(stored_path, root)
        if _is_within_root(resolved, root):
            resolved_paths.add(resolved)

    return resolved_paths


def _scan_upload_root(upload_root: Path) -> tuple[set[Path], set[Path]]:
    cas_files: set[Path] = set()
    suspicious_files: set[Path] = set()

    if not upload_root.exists():
        return cas_files, suspicious_files

    for file_path in upload_root.rglob("*"):
        if not file_path.is_file():
            continue
        resolved = file_path.resolve()
        if _is_cas_blob_file(file_path):
            cas_files.add(resolved)
        else:
            suspicious_files.add(resolved)

    return cas_files, suspicious_files


async def build_cleanup_report(
    session: AsyncSession, upload_root: Path | None = None
) -> StorageCleanupReport:
    root = (upload_root or Path(get_settings().upload_dir)).resolve()
    referenced_paths = await collect_referenced_paths(session, root)
    cas_files, suspicious_files = _scan_upload_root(root)

    missing_referenced_paths = sorted(referenced_paths - cas_files - suspicious_files)
    orphan_paths = sorted(cas_files - referenced_paths)
    reclaimable_bytes = sum(path.stat().st_size for path in orphan_paths if path.exists())

    return StorageCleanupReport(
        upload_root=root,
        referenced_paths=referenced_paths,
        orphan_paths=orphan_paths,
        suspicious_paths=sorted(suspicious_files),
        missing_referenced_paths=missing_referenced_paths,
        reclaimable_bytes=reclaimable_bytes,
    )


def apply_cleanup(
    report: StorageCleanupReport, *, delete: bool = False
) -> StorageCleanupReport:
    if not delete:
        return report

    deleted_paths: list[Path] = []
    deleted_bytes = 0
    candidate_dirs: set[Path] = set()

    for orphan_path in report.orphan_paths:
        if not orphan_path.exists():
            continue
        size = orphan_path.stat().st_size
        orphan_path.unlink()
        deleted_paths.append(orphan_path)
        deleted_bytes += size
        candidate_dirs.add(orphan_path.parent)

    for directory in sorted(candidate_dirs, key=lambda path: len(path.parts), reverse=True):
        current = directory
        while current != report.upload_root and _is_within_root(current, report.upload_root):
            try:
                current.rmdir()
            except OSError:
                break
            current = current.parent

    report.deleted_paths = deleted_paths
    report.deleted_bytes = deleted_bytes
    return report
