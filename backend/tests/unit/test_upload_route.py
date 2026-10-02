from tempfile import SpooledTemporaryFile

import pytest
from fastapi import APIRouter, FastAPI, UploadFile
from httpx import ASGITransport, AsyncClient
from starlette import formparsers

from app.api.utils import upload_route
from app.core.config import get_settings


@pytest.mark.parametrize(
    "path",
    [
        "/api/import/import",
        "/api/import/validate",
        "/api/applications/{application_id}/cv",
        "/api/applications/{application_id}/cover-letter",
    ],
)
@pytest.mark.parametrize("streamed", [False, True])
async def test_upload_limit_precedes_spooling_and_closes_partial_files(
    monkeypatch, path, streamed
):
    monkeypatch.setattr(upload_route, "MAX_IMPORT_BYTES", 512)
    monkeypatch.setattr(upload_route, "MULTIPART_OVERHEAD_BYTES", 512)
    monkeypatch.setattr(get_settings(), "max_document_size_mb", 0)
    files = []

    def track_file(*args, **kwargs):
        file = SpooledTemporaryFile(*args, **kwargs)  # noqa: SIM115 - closed by the parser
        files.append(file)
        return file

    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", track_file)
    router = APIRouter(route_class=upload_route.UploadLimitRoute)

    @router.post(path)
    async def upload(file: UploadFile):
        return {"size": len(await file.read())}

    app = FastAPI()
    app.include_router(router)
    body = (
        b'--boundary\r\nContent-Disposition: form-data; name="file"; filename="a.zip"\r\n\r\n'
        + b"x" * 600
        + b"\r\n--boundary--\r\n"
    )

    async def chunks():
        for offset in range(0, len(body), 100):
            yield body[offset : offset + 100]

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            path.replace("{application_id}", "owned"),
            content=chunks() if streamed else body,
            headers={"Content-Type": "multipart/form-data; boundary=boundary"},
        )
    assert response.status_code == 413
    assert all(file.closed for file in files)
    assert bool(files) is streamed
