import math

from tarnished_cli.client import CLIError


def validate_wait_options(poll_interval: float, timeout_seconds: float) -> None:
    for option, value in (
        ("--poll-interval", poll_interval),
        ("--timeout-seconds", timeout_seconds),
    ):
        if not math.isfinite(value) or value <= 0:
            raise CLIError(f"{option} must be a finite number greater than zero.")
