"""JSON logs in production and readable console logs in development."""

import logging
import os
import sys

from pythonjsonlogger import json


def setup_logging(log_level: str | None = None) -> None:
    """Configure logging based on environment.

    Args:
        log_level: Optional log level override (DEBUG, INFO, WARNING, ERROR)
    """
    env = os.getenv("ENV", "development").lower()
    level = log_level or os.getenv(
        "LOG_LEVEL", "INFO" if env == "production" else "DEBUG"
    )
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)

    if env == "production":
        # JSON formatter for production
        formatter = json.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={
                "asctime": "timestamp",
                "levelname": "level",
                "name": "logger",
            },
        )
    else:
        # Human-readable formatter for development
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    # SQL binds, HTTP URLs and LiteLLM completion kwargs can contain secrets.
    # LiteLLM uses these case-sensitive, independent loggers (not descendants).
    # Set explicit levels so development root DEBUG cannot enable request dumps.
    for name in (
        "asyncio",
        "aiosqlite",
        "httpx",
        "httpcore",
        "openai",
        "LiteLLM",
        "LiteLLM Router",
        "LiteLLM Proxy",
    ):
        logging.getLogger(name).setLevel(logging.WARNING)
