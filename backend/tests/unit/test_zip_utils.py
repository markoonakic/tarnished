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
