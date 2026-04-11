import builtins
import importlib
import sys


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
