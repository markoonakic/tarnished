import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.workspace import JobDetails
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
    )
    from_status_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("application_statuses.id"), nullable=True
    )
    to_status_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("application_statuses.id"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text)

    from_meaning: Mapped[str | None] = mapped_column(String(20))
    to_meaning: Mapped[str | None] = mapped_column(String(20))
    from_meaning_provenance: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="legacy_unknown",
        server_default="legacy_unknown",
    )
    to_meaning_provenance: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="legacy_unknown",
        server_default="legacy_unknown",
    )
    time_provenance: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="legacy_unknown",
        server_default="legacy_unknown",
    )
    is_gap: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    correction_note: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "(to_meaning_provenance != 'recorded' OR to_meaning IS NOT NULL) AND (from_meaning_provenance != 'recorded' OR from_status_id IS NULL OR from_meaning IS NOT NULL)",
            name="ck_history_recorded_meaning",
        ),
        CheckConstraint(
            "from_meaning IS NULL OR from_meaning IN ('unknown','preparing','applied','screening','interviewing','offer','accepted','rejected','withdrawn','no_reply')",
            name="ck_history_from_meaning",
        ),
        CheckConstraint(
            "to_meaning IS NULL OR to_meaning IN ('unknown','preparing','applied','screening','interviewing','offer','accepted','rejected','withdrawn','no_reply')",
            name="ck_history_to_meaning",
        ),
        CheckConstraint(
            "from_meaning_provenance IN ('recorded','legacy_unknown')",
            name="ck_history_from_meaning_provenance",
        ),
        CheckConstraint(
            "to_meaning_provenance IN ('recorded','legacy_unknown')",
            name="ck_history_to_meaning_provenance",
        ),
        CheckConstraint(
            "time_provenance IN ('recorded','legacy_unknown')",
            name="ck_history_time_provenance",
        ),
        CheckConstraint(
            "(is_gap AND from_status_id IS NULL AND to_status_id IS NULL AND from_meaning IS NULL AND to_meaning IS NULL AND note IS NULL AND reason IS NULL AND corrected_at IS NULL AND correction_note IS NULL) OR (NOT is_gap AND to_status_id IS NOT NULL)",
            name="ck_history_gap",
        ),
    )

    application = relationship("Application", back_populates="status_history")
    from_status = relationship("ApplicationStatus", foreign_keys=[from_status_id])
    to_status = relationship("ApplicationStatus", foreign_keys=[to_status_id])

    def __repr__(self) -> str:
        return f"<ApplicationStatusHistory(id={self.id}, application_id={self.application_id}, from_status_id={self.from_status_id}, to_status_id={self.to_status_id}, changed_at={self.changed_at})>"


@exportable(order=4)
class Application(JobDetails, Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("application_statuses.id"), nullable=False
    )
    status_meaning: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown", server_default="unknown"
    )
    status_meaning_provenance: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="legacy_unknown",
        server_default="legacy_unknown",
    )
    evidence_revision: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    response_state: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="legacy_unknown",
        server_default="legacy_unknown",
    )
    response_occurred_on: Mapped[date | None] = mapped_column(Date)
    response_recorded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    response_reference: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "status_meaning IN ('unknown','preparing','applied','screening','interviewing','offer','accepted','rejected','withdrawn','no_reply')",
            name="ck_application_status_meaning",
        ),
        CheckConstraint(
            "status_meaning_provenance IN ('recorded','legacy_unknown')",
            name="ck_application_status_meaning_provenance",
        ),
        CheckConstraint(
            "evidence_revision >= 0", name="ck_application_evidence_revision"
        ),
        CheckConstraint(
            "(response_state = 'recorded' AND response_recorded_at IS NOT NULL) OR (response_state IN ('not_recorded','legacy_unknown') AND response_occurred_on IS NULL AND response_recorded_at IS NULL AND response_reference IS NULL)",
            name="ck_application_response",
        ),
    )

    cv_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_letter_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Latest application-scope grounded report. Not a historical snapshot; the
    # source fingerprint marks it stale when relevant evidence changes.
    report_generation: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    report: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    report_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cv_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cv_original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cover_letter_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_letter_original_filename: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    applied_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    outcome_reason: Mapped[str | None] = mapped_column(Text)
    source_text: Mapped[str | None] = mapped_column(Text)
    source_revision: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
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
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    posted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
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


Index(
    "ix_application_status_history_application_changed_at",
    ApplicationStatusHistory.application_id,
    ApplicationStatusHistory.changed_at,
)

Index(
    "ix_applications_user_applied_created",
    Application.user_id,
    Application.applied_at,
    Application.created_at,
)

Index(
    "ix_applications_user_status_applied_created",
    Application.user_id,
    Application.status_id,
    Application.applied_at,
    Application.created_at,
)

Index(
    "ix_applications_user_source_applied_created",
    Application.user_id,
    Application.source,
    Application.applied_at,
    Application.created_at,
    sqlite_where=Application.source.is_not(None),
    postgresql_where=Application.source.is_not(None),
)

Index(
    "ix_applications_user_job_url",
    Application.user_id,
    Application.job_url,
    sqlite_where=Application.job_url.is_not(None),
    postgresql_where=Application.job_url.is_not(None),
)

Index("ix_applications_status_id", Application.status_id)
