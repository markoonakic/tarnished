import builtins
import importlib
import sys
from pathlib import Path

import pytest


def test_zip_utils_imports_without_libmagic(monkeypatch):
    original_import = builtins.__import__

    def failing_import(name, *args, **kwargs):
        if name == "magic":
            raise ImportError("failed to find libmagic")
        return original_import(name, *args, **kwargs)

    monkeypatch.delitem(sys.modules, "app.api.utils.zip_utils", raising=False)
    monkeypatch.delitem(sys.modules, "magic", raising=False)
    monkeypatch.setattr(builtins, "__import__", failing_import)

    module = importlib.import_module("app.api.utils.zip_utils")

    assert module.detect_extension(b"%PDF-1.7") == ".bin"
    assert module.detect_mime_type(b"%PDF-1.7") == "application/octet-stream"


def test_detect_mime_type_falls_back_to_magic_from_file_for_audio(monkeypatch):
    module = importlib.import_module("app.api.utils.zip_utils")

    class FakeMagic:
        @staticmethod
        def from_buffer(_content, mime=True):
            assert mime is True
            return "application/octet-stream"

        @staticmethod
        def from_file(_path, mime=True):
            assert mime is True
            return "audio/x-wav"

    monkeypatch.setattr(module, "magic", FakeMagic)

    assert module.detect_mime_type(b"RIFF\x00\x00\x00\x00WAVEfmt ") == "audio/x-wav"


def test_document_validation_requires_libmagic(tmp_path, monkeypatch):
    module = importlib.import_module("app.api.utils.zip_utils")
    monkeypatch.setattr(module, "magic", None)
    path = tmp_path / "document.pdf"
    path.write_bytes(b"not a document")
    assert module.validate_file(path, module.ALLOWED_DOCUMENT_TYPES)[0] is False


def test_store_file_uses_canonical_paths_and_preserves_shared_content(
    tmp_path, monkeypatch
):
    module = importlib.import_module("app.api.utils.zip_utils")
    from app.core.config import get_settings, resolve_upload_path

    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    monkeypatch.setattr(module, "detect_extension", lambda _: ".txt")
    content = b"document bytes"
    stored = module.store_file(content, tmp_path)
    assert stored.startswith("uploads/")
    destination = Path(resolve_upload_path(stored))
    assert destination.read_bytes() == content
    assert module.store_file(content, tmp_path) == stored
    assert list(tmp_path.iterdir()) == [destination]
    destination.write_bytes(b"corrupt")
    with pytest.raises(OSError, match="CAS integrity mismatch"):
        module.store_file(content, tmp_path)
    assert destination.read_bytes() == b"corrupt"
    assert list(tmp_path.iterdir()) == [destination]


def test_archive_paths_and_filename_bounds():
    module = importlib.import_module("app.api.utils.zip_utils")
    application = {"company": "Example", "job_title": "Engineer", "id": "12345678"}
    round_data = {
        "round_type": {"name": "Interview"},
        "transcript_path": "uploads/a.txt",
    }
    directory = "applications/Example - Engineer (12345678)/rounds/01 - Interview/"
    assert (
        module.build_transcript_path(application, round_data, 0)
        == directory + "transcript.txt"
    )
    assert (
        module.build_round_media_path(
            application, round_data, 0, {"original_filename": "recording.wav"}
        )
        == directory + "recording.wav"
    )
    for name in ("x" * 220 + ".pdf", "x." + "a" * 250):
        assert len(module.sanitize_filename(name)) <= 200
