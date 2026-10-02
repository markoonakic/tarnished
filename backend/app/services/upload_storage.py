"""Atomic content-addressed upload storage."""

import hashlib
import os
from pathlib import Path


def publish_file(path: Path, upload_root: Path, digest: str, extension: str) -> str:
    """Publish a same-filesystem temporary file without replacing shared content."""
    destination = upload_root.resolve() / f"{digest}{extension}"
    try:
        os.link(path, destination)
    except FileExistsError:
        if destination.is_symlink() or not destination.is_file():
            raise OSError("Invalid CAS destination") from None
        with destination.open("rb") as existing:
            if hashlib.file_digest(existing, "sha256").hexdigest() != digest:
                raise OSError("CAS integrity mismatch") from None
    directory = os.open(upload_root.resolve(), os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return f"uploads/{destination.name}"
