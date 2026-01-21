import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status_id: Mapped[str] = mapped_column(String(36), ForeignKey("application_statuses.id"), nullable=False)
    cv_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_letter_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[date] = mapped_column(Date, default=date.today)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="applications")
    status = relationship("ApplicationStatus", back_populates="applications")
    rounds = relationship("Round", back_populates="application", cascade="all, delete-orphan")
