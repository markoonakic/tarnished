"""Bound transcript bodies before FastAPI parses JSON or spools multipart files."""

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute

from app.core.config import get_settings
from app.schemas.transcript import MAX_TRANSCRIPT_BYTES


class TranscriptBodyLimitRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        interview = self.path in (
            "/api/rounds/{round_id}/interview-feedback",
            "/api/applications/{application_id}/documents/{kind}/text",
        )
        if not interview and self.path != "/api/rounds/{round_id}/transcript":
            return handler

        async def bounded(request: Request):
            if request.method in ("POST", "PUT", "PATCH"):
                # JSON escaping/IDs add overhead. Legacy documents retain their cap.
                limit = (
                    max(
                        MAX_TRANSCRIPT_BYTES,
                        get_settings().max_document_size_mb * 1024 * 1024,
                    )
                    + 128_000
                    if request.method == "POST"
                    else 16_000_000
                )
                if interview:
                    limit = 256_000  # Encoded envelope cap, independent of text length.
                chunks = []
                size = 0
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > limit:
                        raise HTTPException(413, "Text request body is too large")
                    chunks.append(chunk)
                # Request.body()/form() reuse this bounded buffer, not the wire stream.
                request._body = b"".join(chunks)
            try:
                return await handler(request)
            except RequestValidationError as exc:
                # Validation errors otherwise echo private text (or invalid Unicode).
                raise HTTPException(
                    422,
                    "Invalid interview request. Check text, revision and request intent"
                    if interview
                    else "Invalid transcript request. Check the expected generation, text, segment IDs, roles and timestamps",
                ) from exc

        return bounded
