from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models import User


def _utc_now() -> datetime:
    return datetime.now(UTC)


def validate_time_zone_name(value: str | None) -> str | None:
    if not value:
        return None

    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        return None

    return value


def get_effective_time_zone_name(
    user: User,
    *,
    x_timezone: str | None = None,
) -> str | None:
    request_zone = validate_time_zone_name(x_timezone)
    prefs = user.settings if isinstance(user.settings, dict) else {}
    time_zone_mode = prefs.get("time_zone_mode")
    stored_zone = prefs.get("time_zone")
    validated_stored_zone = (
        validate_time_zone_name(stored_zone) if isinstance(stored_zone, str) else None
    )

    if time_zone_mode == "manual":
        return validated_stored_zone or request_zone

    if request_zone is not None:
        return request_zone

    return validated_stored_zone


def get_user_local_today(
    user: User,
    *,
    x_timezone: str | None = None,
) -> date:
    time_zone_name = get_effective_time_zone_name(user, x_timezone=x_timezone)
    if time_zone_name is None:
        return _utc_now().date()

    return _utc_now().astimezone(ZoneInfo(time_zone_name)).date()


class RoundTimeZoneConflict(ValueError):
    """The submitted wall time was edited under a different effective zone."""


def normalize_round_datetime(
    value: datetime | None,
    user: User,
    *,
    x_timezone: str | None = None,
    expected_time_zone: str | None = None,
) -> datetime | None:
    """Round wall times use the effective zone; explicit offsets preserve the instant.

    New ambiguous wall times select the first occurrence (fold=0). Missing wall
    times are rejected rather than silently shifted across a DST gap.
    """
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(UTC)
    zone_name = get_effective_time_zone_name(user, x_timezone=x_timezone)
    if expected_time_zone is not None and expected_time_zone != zone_name:
        raise RoundTimeZoneConflict(
            "Round time zone changed. Reload time zone preferences and saved dates before saving."
        )
    if zone_name is None:
        raise ValueError("Provide a Time-Zone header or an explicit date/time offset")
    local = value.replace(tzinfo=ZoneInfo(zone_name), fold=0)
    utc = local.astimezone(UTC)
    if utc.astimezone(local.tzinfo).replace(tzinfo=None) != value:
        raise ValueError(
            "This local time does not exist due to daylight saving; choose another time"
        )
    return utc
