"""Limit multipart requests before the form parser writes temporary files."""

from fastapi import HTTPException, Request
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.formparsers import MultiPartException

from app.core.config import get_settings

MAX_IMPORT_BYTES = 2_200_000_000
MULTIPART_OVERHEAD_BYTES = 128_000


class UploadLimitRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        archive = self.path in ("/api/import/import", "/api/import/validate")
        document = self.path in (
            "/api/applications/{application_id}/cv",
            "/api/applications/{application_id}/cover-letter",
        )
        if not archive and not document:
            return handler

        async def bounded(request: Request):
            if request.method != "POST":
                return await handler(request)
            limit = (
                MAX_IMPORT_BYTES
                if archive
                else get_settings().max_document_size_mb * 1024 * 1024
                + MULTIPART_OVERHEAD_BYTES
            )
            length = request.headers.get("content-length")
            if length is not None:
                if not length.isascii() or not length.isdecimal() or len(length) > 20:
                    raise HTTPException(400, "Invalid upload content length")
                if int(length) > limit:
                    raise HTTPException(413, "Upload request is too large")
            receive = request._receive
            size = 0
            exceeded = False

            async def limited_receive():
                nonlocal size, exceeded
                message = await receive()
                size += len(message.get("body", b""))
                if size > limit:
                    exceeded = True
                    # Starlette closes spooled files when this exception is raised.
                    raise MultiPartException("Upload request is too large")
                return message

            request._receive = limited_receive
            try:
                return await handler(request)
            except StarletteHTTPException:
                if exceeded:
                    raise HTTPException(413, "Upload request is too large") from None
                raise
            finally:
                request._receive = receive

        return bounded
