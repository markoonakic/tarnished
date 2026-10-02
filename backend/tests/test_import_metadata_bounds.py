"""Metadata keeps its pre-recording 100-MiB buffering ceiling, before IO/decode."""

import io
import json
import os
import zipfile
from types import SimpleNamespace

import pytest
from tests.test_core_mutation_integrity import workspace as workspace

from app.api.utils import zip_utils
from app.services.import_execution import (
    extract_files_from_new_format,
    verify_new_format_manifest_checksum,
)


@pytest.fixture(params=["data.json", "manifest.json"])
def oversized_metadata(request, monkeypatch, tmp_path):
    name = request.param
    content = io.BytesIO()
    with zipfile.ZipFile(content, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr("data.json", '{"format_version":"1.0.0","models":{}}')
        archive.writestr("manifest.json", '{"files":{}}')
    path = tmp_path / "metadata.zip"
    path.write_bytes(content.getvalue())
    original_init = zipfile.ZipFile.__init__
    original_read = zipfile.ZipFile.read
    original_loads = json.loads
    reads, decodes = [], []

    def advertised_size(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        if self.mode == "r":
            self.getinfo(name).file_size = 100 * 1024 * 1024 + 1

    def guarded_read(self, member, *args, **kwargs):
        if member == name:
            reads.append(member)
            return b'"oversized metadata decode sentinel"'
        return original_read(self, member, *args, **kwargs)

    def guarded_loads(value, *args, **kwargs):
        if value == b'"oversized metadata decode sentinel"':
            decodes.append(name)
            raise AssertionError("oversized metadata reached json.loads")
        return original_loads(value, *args, **kwargs)

    monkeypatch.setattr(zipfile.ZipFile, "__init__", advertised_size)
    monkeypatch.setattr(zipfile.ZipFile, "read", guarded_read)
    monkeypatch.setattr(json, "loads", guarded_loads)
    # Model a stored member's disk size, so the older compression-ratio guard
    # cannot accidentally make this regression pass. No large fixture/IO.
    monkeypatch.setattr(
        zip_utils,
        "os",
        SimpleNamespace(
            PathLike=os.PathLike,
            path=SimpleNamespace(getsize=lambda _: 101 * 1024 * 1024),
        ),
    )
    return path, content.getvalue(), reads, decodes


@pytest.mark.parametrize("route", ["validate", "import"])
async def test_import_routes_reject_metadata_before_read_and_decode(
    client, workspace, oversized_metadata, route
):
    _, content, reads, decodes = oversized_metadata
    response = await client.post(
        f"/api/import/{route}",
        files={"file": ("metadata.zip", content, "application/zip")},
    )
    if route == "validate":
        assert response.status_code == 200, response.text
        result = response.json()
        assert not result["valid"]
        assert "100 MiB" in str(result["errors"])
    else:
        assert response.status_code == 202, response.text
        status = await client.get(f"/api/import/status/{response.json()['import_id']}")
        assert status.json()["status"] == "failed", status.text
        assert "100 MiB" in status.text
    assert not reads and not decodes


def test_import_extraction_rejects_metadata_before_read_and_decode(oversized_metadata):
    path, _, reads, decodes = oversized_metadata
    with pytest.raises(ValueError, match="100 MiB"):
        extract_files_from_new_format(str(path), "synthetic")
    assert not reads and not decodes


@pytest.mark.parametrize("oversized_metadata", ["manifest.json"], indirect=True)
def test_import_checksum_rejects_manifest_before_read_and_decode(oversized_metadata):
    path, _, reads, decodes = oversized_metadata
    with zipfile.ZipFile(path) as archive:
        with pytest.raises(ValueError, match="100 MiB"):
            verify_new_format_manifest_checksum(
                {"format_version": "1.0.0", "models": {}}, b"{}", archive
            )
    assert not reads and not decodes
