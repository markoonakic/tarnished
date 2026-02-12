"""Structured logging configuration for the application.

Configures JSON-formatted logging in production environments for easier
parsing and integration with log aggregation systems (e.g., ELK, Datadog).

In development, uses human-readable console output.
"""

import logging
import os
import sys
from typing import Optional

# Only import json logger if available (graceful fallback)
try:
    from pythonjsonlogger import json
    JSON_LOGGER_AVAILABLE = True
except ImportError:
    JSON_LOGGER_AVAILABLE = False


def setup_logging(log_level: Optional[str] = None) -> None:
    """Configure logging based on environment.

    Args:
        log_level: Optional log level override (DEBUG, INFO, WARNING, ERROR)
    """
    env = os.getenv("ENV", "development").lower()
    level = log_level or os.getenv("LOG_LEVEL", "INFO" if env == "production" else "DEBUG")
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

    if env == "production" and JSON_LOGGER_AVAILABLE:
        # JSON formatter for production
        formatter = json.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={
                "asctime": "timestamp",
                "levelname": "level",
                "name": "logger",
            }
        )
    else:
        # Human-readable formatter for development
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Configured logger instance
    """
    return logging.getLogger(name)
