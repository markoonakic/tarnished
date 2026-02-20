"""System-wide settings model.

Stores global configuration like LiteLLM API settings.
Uses a key-value pattern for flexibility.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemSettings(Base):
    """System-wide settings stored as key-value pairs."""

    __tablename__ = "system_settings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    key: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False
    )
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    # Known setting keys
    KEY_LITELLM_MODEL = "litellm_model"
    KEY_LITELLM_API_KEY = "litellm_api_key"
    KEY_LITELLM_BASE_URL = "litellm_base_url"

    @classmethod
    def get_known_keys(cls) -> list[str]:
        """Return list of known setting keys."""
        return [
            cls.KEY_LITELLM_MODEL,
            cls.KEY_LITELLM_API_KEY,
            cls.KEY_LITELLM_BASE_URL,
        ]
