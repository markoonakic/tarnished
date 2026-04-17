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
    except ZoneInfoNotFoundError:
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
        validate_time_zone_name(stored_zone)
        if isinstance(stored_zone, str)
        else None
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
