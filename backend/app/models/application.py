import uuid
from datetime import UTC, date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.services.export_registry import exportable


@exportable(order=5)
class ApplicationStatusHistory(Base):
    __tablename__ = "application_status_history"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    application_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("application_statuses.id"), nullable=True
    )
    to_status_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("application_statuses.id"), nullable=False
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    application = relationship("Application", back_populates="status_history")
    from_status = relationship("ApplicationStatus", foreign_keys=[from_status_id])
    to_status = relationship("ApplicationStatus", foreign_keys=[to_status_id])

    def __repr__(self) -> str:
        return f"<ApplicationStatusHistory(id={self.id}, application_id={self.application_id}, from_status_id={self.from_status_id}, to_status_id={self.to_status_id}, changed_at={self.changed_at})>"


@exportable(order=4)
class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("application_statuses.id"), nullable=False
    )
    cv_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cv_original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cover_letter_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_letter_original_filename: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    applied_at: Mapped[date] = mapped_column(Date, default=date.today)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Job Lead relationship (for converted leads)
    job_lead_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("job_leads.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Rich extraction fields (populated from JobLead conversion or direct extraction)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    recruiter_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recruiter_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recruiter_linkedin_url: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )
    requirements_must_have: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    requirements_nice_to_have: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    skills: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    years_experience_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    years_experience_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user = relationship("User", back_populates="applications")
    status = relationship("ApplicationStatus", back_populates="applications")
    rounds = relationship(
        "Round", back_populates="application", cascade="all, delete-orphan"
    )
    status_history = relationship(
        "ApplicationStatusHistory",
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="desc(ApplicationStatusHistory.changed_at)",
    )
    # The job lead this application was created from (via job_lead_id FK)
    job_lead = relationship("JobLead", foreign_keys=[job_lead_id])
