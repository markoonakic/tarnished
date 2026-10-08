"""Bounded durable text-report intent for all report scopes; never exported with credentials."""

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


class InterviewJob(Base):
    __tablename__ = "interview_jobs"
    __table_args__ = (UniqueConstraint("user_id", "intent_id"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Exactly one target is set, chosen by scope: INTERVIEW uses round_id,
    # APPLICATION uses application_id, PIPELINE uses neither.
    scope: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="INTERVIEW",
        server_default="INTERVIEW",
        index=True,
    )
    round_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )
    application_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    analysis_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("job_analyses.id", ondelete="CASCADE"), index=True
    )
    intent_id: Mapped[str] = mapped_column(String(36))
    generation: Mapped[int] = mapped_column(Integer)
    fingerprint: Mapped[str] = mapped_column(String(64))
    manifest: Mapped[dict] = mapped_column(JSON)
    config_revision: Mapped[str] = mapped_column(String(36))
    provider: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(200))
    session_version: Mapped[int] = mapped_column(Integer)
    api_key_id: Mapped[str | None] = mapped_column(String(36))
    required_scopes: Mapped[list] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    claim_id: Mapped[str | None] = mapped_column(String(36))
    uncertain: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(String(300))
    checkpoints: Mapped[list] = mapped_column(JSON, default=list)
    total_sections: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
