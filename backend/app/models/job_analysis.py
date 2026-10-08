"""Saved, owner-scoped proposals. Jobs are execution intent, not archive data."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.services.export_registry import exportable


@exportable(order=20)
class JobAnalysis(Base):
    __tablename__ = "job_analyses"
    __table_args__ = (
        CheckConstraint(
            "(lead_id IS NOT NULL AND application_id IS NULL) OR (lead_id IS NULL AND application_id IS NOT NULL)",
            name="ck_analysis_target",
        ),
        CheckConstraint(
            "kind IN ('EXTRACTION', 'PROFILE_MATCH', 'PREPARATION')",
            name="ck_analysis_kind",
        ),
        CheckConstraint(
            "(kind = 'PREPARATION' AND round_id IS NOT NULL AND application_id IS NOT NULL) OR (kind != 'PREPARATION' AND round_id IS NULL)",
            name="ck_analysis_round",
        ),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    lead_id: Mapped[str | None] = mapped_column(
        ForeignKey("job_leads.id", ondelete="CASCADE"), index=True
    )
    application_id: Mapped[str | None] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    round_id: Mapped[str | None] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16))
    revision: Mapped[int] = mapped_column(Integer, default=0)
    fingerprint: Mapped[str] = mapped_column(String(64), default="")
    source_text: Mapped[str] = mapped_column(Text, default="")
    input_revisions: Mapped[dict] = mapped_column(JSON, default=dict)
    language: Mapped[str] = mapped_column(String(10), default="en")
    draft: Mapped[dict] = mapped_column(JSON, default=dict)
    reviewed: Mapped[list] = mapped_column(JSON, default=list)
    review_state: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
