"""
Structured error response schemas for the Tarnished API.

This module provides:
- ErrorCode enum with all possible error codes
- ErrorResponse schema for consistent error formatting
- Helper functions for creating error responses

Following RFC 7807 (Problem Details for HTTP APIs) patterns.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel


class ErrorCode(str, Enum):
    """Standardized error codes for the API.

    These codes allow clients (web app, extension) to programmatically
    identify error types and show appropriate user-facing messages.
    """

    # AI/LLM errors
    AI_KEY_NOT_CONFIGURED = "AI_KEY_NOT_CONFIGURED"
    AI_KEY_INVALID = "AI_KEY_INVALID"
    AI_RATE_LIMITED = "AI_RATE_LIMITED"
    AI_TIMEOUT = "AI_TIMEOUT"
    AI_SERVICE_ERROR = "AI_SERVICE_ERROR"
    AI_EXTRACTION_FAILED = "AI_EXTRACTION_FAILED"

    # Authentication errors
    AUTH_INVALID_API_KEY = "AUTH_INVALID_API_KEY"
    AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
    AUTH_UNAUTHORIZED = "AUTH_UNAUTHORIZED"

    # Validation errors
    VALIDATION_ERROR = "VALIDATION_ERROR"
    DUPLICATE_RESOURCE = "DUPLICATE_RESOURCE"

    # Resource errors
    NOT_FOUND = "NOT_FOUND"
    FORBIDDEN = "FORBIDDEN"

    # Network/Server errors
    NETWORK_ERROR = "NETWORK_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ErrorResponse(BaseModel):
    """Structured error response for API errors.

    Attributes:
        code: Machine-readable error code for programmatic handling.
        message: User-friendly message suitable for display.
        detail: Optional technical detail for debugging (not shown to users).
        action: Optional suggested action the user can take.
    """

    code: ErrorCode
    message: str
    detail: str | None = None
    action: str | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "code": "AI_KEY_NOT_CONFIGURED",
                    "message": "AI extraction requires an API key",
                    "detail": None,
                    "action": "Add your API key in Settings → AI Configuration",
                }
            ]
        }
    }


# Predefined error responses for common cases
ERROR_RESPONSES: dict[ErrorCode, dict[str, Any]] = {
    ErrorCode.AI_KEY_NOT_CONFIGURED: {
        "message": "AI extraction requires an API key",
        "action": "Add your API key in Settings → AI Configuration",
    },
    ErrorCode.AI_KEY_INVALID: {
        "message": "AI API key is invalid",
        "action": "Check your API key in Settings → AI Configuration",
    },
    ErrorCode.AI_RATE_LIMITED: {
        "message": "AI service is rate limited",
        "action": "Wait a moment and try again",
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
    ErrorCode.AUTH_INVALID_API_KEY: {
        "message": "Invalid API key",
        "action": "Regenerate your API key in Settings → API Key",
    },
    ErrorCode.AUTH_UNAUTHORIZED: {
        "message": "Authentication required",
        "action": "Log in and try again",
    },
    ErrorCode.DUPLICATE_RESOURCE: {
        "message": "This resource already exists",
        "action": None,
    },
    ErrorCode.NOT_FOUND: {
        "message": "Resource not found",
        "action": None,
    },
    ErrorCode.FORBIDDEN: {
        "message": "You don't have permission to access this",
        "action": None,
    },
    ErrorCode.VALIDATION_ERROR: {
        "message": "Invalid request",
        "action": None,
    },
    ErrorCode.INTERNAL_ERROR: {
        "message": "An unexpected error occurred",
        "action": "Try again later",
    },
}


def make_error_response(
    code: ErrorCode,
    detail: str | None = None,
    message_override: str | None = None,
    action_override: str | None = None,
) -> dict[str, Any]:
    """Create a standardized error response dictionary.

    Args:
        code: The error code.
        detail: Optional technical detail for debugging.
        message_override: Override the default message if needed.
        action_override: Override the default action if needed.

    Returns:
        Dictionary with code, message, detail, and action fields.
    """
    base = ERROR_RESPONSES.get(code, {})
    return {
        "code": code,
        "message": message_override or base.get("message", "An error occurred"),
        "detail": detail,
        "action": action_override or base.get("action"),
    }
