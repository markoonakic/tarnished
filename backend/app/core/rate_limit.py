"""Shared rate limiting configuration for the application."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def get_rate_limit_key(request) -> str:
    """Get rate limit key, disabled during testing.

    Returns a unique key per request path when rate limiting is disabled
    to effectively bypass the rate limiter during tests.
    """
    if os.environ.get("ENABLE_RATE_LIMITING", "true").lower() == "false":
        return f"test_override_{request.url.path}"
    return get_remote_address(request)


# Shared limiter instance for all routers
limiter = Limiter(key_func=get_rate_limit_key)
