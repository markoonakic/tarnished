import uuid
from datetime import UTC, date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.services.export_registry import exportable


@exportable(order=8)
class JobLead(Base):
    __tablename__ = "job_leads"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")

    # Core job info
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)

    # Rich extraction
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # People intelligence
    recruiter_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recruiter_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recruiter_linkedin_url: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )

    # Requirements
    requirements_must_have: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    requirements_nice_to_have: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    years_experience_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    years_experience_max: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Metadata
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    posted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Status
    converted_to_application_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey(
            "applications.id",
            use_alter=True,
            name="fk_job_leads_converted_to_application",
        ),
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    user = relationship("User", backref="job_leads")
    # This relationship points to the Application this lead was converted to
    # (via converted_to_application_id). Note: Application.job_lead is a different
    # relationship based on job_lead_id FK, so we use foreign_keys to disambiguate.
    converted_application = relationship(
        "Application",
        foreign_keys=[converted_to_application_id],
        backref="source_job_lead",
    )

    def __repr__(self) -> str:
        return f"<JobLead(id={self.id}, status={self.status}, title={self.title}, company={self.company})>"
