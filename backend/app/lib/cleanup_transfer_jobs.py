from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.core.database import async_session_maker
from app.services.transfer_job_cleanup import (
    apply_transfer_job_cleanup,
    build_transfer_job_cleanup_report,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report and optionally delete expired transfer jobs and export artifacts."
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete expired transfer job rows and export artifacts.",
    )
    return parser.parse_args()


def _print_paths(header: str, paths: list[Path]) -> None:
    if not paths:
        return
    print(f"\n{header}:")
    for path in paths:
        print(f"  {path}")


async def run_cleanup(delete: bool) -> int:
    async with async_session_maker() as session:
        report = await build_transfer_job_cleanup_report(session)
        report = await apply_transfer_job_cleanup(session, report, delete=delete)

    mode = "DELETE" if delete else "DRY-RUN"
    print(f"Transfer job cleanup mode: {mode}")
    print(f"Expired artifacts: {len(report.expired_artifact_paths)}")
    print(f"Expired jobs: {len(report.expired_job_ids)}")
    print(f"Deleted artifacts: {len(report.deleted_artifact_paths)}")
    print(f"Deleted jobs: {len(report.deleted_job_ids)}")

    _print_paths("Expired artifacts", report.expired_artifact_paths)
    return 0


def main() -> int:
    args = parse_args()
    return asyncio.run(run_cleanup(delete=args.delete))


if __name__ == "__main__":
    raise SystemExit(main())
