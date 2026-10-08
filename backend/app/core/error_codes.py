"""Stable public error codes. English detail remains available to older clients."""

HTTP_CODES = {
    400: "invalid_request",
    401: "authentication_required",
    403: "access_denied",
    404: "not_found",
    409: "conflict",
    413: "too_large",
    422: "validation_error",
    429: "rate_limited",
    500: "server_error",
    502: "service_error",
    503: "service_unavailable",
    504: "service_timeout",
}
DETAIL_CODES = {
    "Round time zone changed. Reload time zone preferences and saved dates before saving.": "round_time_zone_changed",
    "Recording has no audio track. Upload a recording containing speech": "no_audio_track",
    "Incorrect email or password": "invalid_credentials",
    "Invalid email or password": "invalid_credentials",
    "Inactive user": "inactive_account",
    "User is inactive": "inactive_account",
    "Account is disabled": "inactive_account",
    "Current password is incorrect": "incorrect_password",
    "Incorrect current password": "incorrect_password",
    "Email already registered": "email_in_use",
    "Application not found": "application_not_found",
    "Job lead not found": "lead_not_found",
    "Round not found": "round_not_found",
    "Processing queue is full": "queue_full",
}


def error_code(status: int, detail: object) -> str:
    if isinstance(detail, dict) and isinstance(detail.get("code"), str):
        return detail["code"]
    if isinstance(detail, str) and detail in DETAIL_CODES:
        return DETAIL_CODES[detail]
    return HTTP_CODES.get(status, "request_failed")
