from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.core.database import async_session_maker
from app.services.storage_cleanup import apply_cleanup, build_cleanup_report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report and optionally delete unreferenced CAS blobs under UPLOAD_DIR."
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete orphaned CAS blobs. Without this flag, the command is dry-run only.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print individual orphan, missing-reference, and suspicious file paths.",
    )
    return parser.parse_args()


def _print_paths(header: str, paths: list[Path]) -> None:
    if not paths:
        return
    print(f"\n{header}:")
    for path in paths:
        print(f"  {path}")


async def run_cleanup(delete: bool, verbose: bool) -> int:
    async with async_session_maker() as session:
        report = await build_cleanup_report(session)
        report = apply_cleanup(report, delete=delete)

    mode = "DELETE" if delete else "DRY-RUN"
    print(f"Upload cleanup mode: {mode}")
    print(f"Upload root: {report.upload_root}")
    print(f"Referenced files: {len(report.referenced_paths)}")
    print(f"Missing referenced files: {len(report.missing_referenced_paths)}")
    print(f"Orphan CAS files: {len(report.orphan_paths)}")
    print(f"Suspicious non-CAS files: {len(report.suspicious_paths)}")
    print(f"Reclaimable bytes: {report.reclaimable_bytes}")
    print(f"Deleted files: {len(report.deleted_paths)}")
    print(f"Deleted bytes: {report.deleted_bytes}")

    if verbose:
        _print_paths("Missing referenced files", report.missing_referenced_paths)
        _print_paths("Orphan CAS files", report.orphan_paths)
        _print_paths("Suspicious non-CAS files", report.suspicious_paths)
        if report.deleted_paths:
            _print_paths("Deleted files", report.deleted_paths)

    return 0


def main() -> int:
    args = parse_args()
    return asyncio.run(run_cleanup(delete=args.delete, verbose=args.verbose))


if __name__ == "__main__":
    raise SystemExit(main())
