import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String, Text
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
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

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
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    round = relationship("Round", back_populates="media")
