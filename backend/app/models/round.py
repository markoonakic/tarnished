import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.services.export_registry import exportable


class MediaType(str, Enum):
    VIDEO = "video"
    AUDIO = "audio"


@exportable(order=6)
class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    application_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("applications.id"), nullable=False, index=True
    )
    round_type_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("round_types.id"), nullable=False
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    outcome: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript_original_filename: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    media_generation: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    transcript_generation: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    current_transcript: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
    interview_generation: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    interview_report: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True), nullable=True
    )
    interview_report_reason: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    transcript_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    @property
    def has_current_transcript(self) -> bool:
        return self.current_transcript is not None

    application = relationship("Application", back_populates="rounds")
    round_type = relationship("RoundType", back_populates="rounds")
    media = relationship(
        "RoundMedia", back_populates="round", cascade="all, delete-orphan"
    )


@exportable(order=7)
class RoundMedia(Base):
    __tablename__ = "round_media"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    round_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rounds.id"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # ID identifies immutable bytes; replacement creates a new row/ID. Null
    # metadata means legacy/unvalidated, never fabricated decoder coverage.
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    byte_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    probed_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    validation: Mapped[str | None] = mapped_column(String(32), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    round = relationship("Round", back_populates="media")


Index("ix_rounds_round_type_id", Round.round_type_id)
Index("ix_round_media_round_id", RoundMedia.round_id)
