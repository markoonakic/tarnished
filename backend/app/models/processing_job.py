"""Durable transcription only. Deliberately not registered for personal archives."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ProcessingJob(Base):
    __tablename__ = "transcription_jobs"
    __table_args__ = (UniqueConstraint("user_id", "intent_id"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    round_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )
    media_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("round_media.id", ondelete="CASCADE")
    )
    intent_id: Mapped[str] = mapped_column(String(36))
    retry_intents: Mapped[list] = mapped_column(JSON, default=list)
    source_path: Mapped[str] = mapped_column(String(500))
    source_hash: Mapped[str | None] = mapped_column(String(64))
    media_generation: Mapped[int] = mapped_column(Integer)
    transcript_generation: Mapped[int] = mapped_column(Integer)
    config_revision: Mapped[str] = mapped_column(String(36))
    provider: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(200))
    session_version: Mapped[int] = mapped_column(Integer)
    api_key_id: Mapped[str | None] = mapped_column(String(36))
    required_scopes: Mapped[list] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    stage: Mapped[str] = mapped_column(String(24), default="queued")
    claim_id: Mapped[str | None] = mapped_column(String(36))
    uncertain: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(String(300))
    checkpoints: Mapped[list] = mapped_column(JSON, default=list)
    coverage: Mapped[list] = mapped_column(JSON, default=list)
    result_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
