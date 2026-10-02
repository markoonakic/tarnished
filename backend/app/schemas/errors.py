"""Structured extraction and duplicate-resource errors."""

from enum import Enum
from typing import Any


class ErrorCode(str, Enum):
    AI_KEY_NOT_CONFIGURED = "AI_KEY_NOT_CONFIGURED"
    AI_TIMEOUT = "AI_TIMEOUT"
    AI_SERVICE_ERROR = "AI_SERVICE_ERROR"
    AI_EXTRACTION_FAILED = "AI_EXTRACTION_FAILED"
    DUPLICATE_RESOURCE = "DUPLICATE_RESOURCE"


ERROR_RESPONSES: dict[ErrorCode, dict[str, Any]] = {
    ErrorCode.AI_KEY_NOT_CONFIGURED: {
        "message": "AI extraction requires an API key",
        "action": "Add your API key in Settings → AI Configuration",
    },
    ErrorCode.AI_TIMEOUT: {
        "message": "AI request timed out",
        "action": "Try again - the service may be slow",
    },
    ErrorCode.AI_SERVICE_ERROR: {
        "message": "AI service encountered an error",
        "action": "Try again later",
    },
    ErrorCode.AI_EXTRACTION_FAILED: {
        "message": "Could not extract job data",
        "action": "Make sure the URL points to a valid job posting",
    },
    ErrorCode.DUPLICATE_RESOURCE: {
        "message": "This resource already exists",
        "action": None,
    },
}


def make_error_response(
    code: ErrorCode,
    detail: str | None = None,
    message_override: str | None = None,
) -> dict[str, Any]:
    base = ERROR_RESPONSES[code]
    return {
        "code": code,
        "message": message_override or base["message"],
        "detail": detail,
        "action": base["action"],
    }
