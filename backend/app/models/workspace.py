"""Owner-scoped address book, notes, reminders and extra documents."""

from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.services.export_registry import exportable


class OwnedRecord:
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    revision: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


@exportable(order=2)
class Company(OwnedRecord, Base):
    __tablename__ = "companies"
    name: Mapped[str] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(2048))
    industry: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    size: Mapped[str | None] = mapped_column(String(20))
    description: Mapped[str | None] = mapped_column(Text)
    culture_notes: Mapped[str | None] = mapped_column(Text)


@exportable(order=3)
class Contact(OwnedRecord, Base):
    __tablename__ = "contacts"
    name: Mapped[str] = mapped_column(String(255))
    function: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(100))
    profile_url: Mapped[str | None] = mapped_column(String(2048))
    role: Mapped[str | None] = mapped_column(String(100))
    last_contact_on: Mapped[date | None] = mapped_column(Date)
    communication_note: Mapped[str | None] = mapped_column(Text)
    company_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )


class JobDetails:
    company_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
    recruiter_contact_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="SET NULL")
    )
    work_mode: Mapped[str | None] = mapped_column(String(30))
    employment_type: Mapped[str | None] = mapped_column(String(30))
    seniority: Mapped[str | None] = mapped_column(String(50))
    deadline: Mapped[date | None] = mapped_column(Date)
    pay_period: Mapped[str | None] = mapped_column(String(20))
    priority: Mapped[str] = mapped_column(
        String(10), default="normal", server_default="normal"
    )
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    confirmed_requirements: Mapped[list[dict]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    requirements_revision: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )


class Target:
    lead_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("job_leads.id", ondelete="CASCADE"), index=True
    )
    application_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    company_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="CASCADE"), index=True
    )
    round_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )


TARGET_COUNT = " + ".join(
    f"(CASE WHEN {field}_id IS NULL THEN 0 ELSE 1 END)"
    for field in ("lead", "application", "company", "contact", "round")
)


@exportable(order=10)
class Note(OwnedRecord, Target, Base):
    __tablename__ = "notes"
    body: Mapped[str] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint(f"{TARGET_COUNT} = 1", name="ck_note_one_target"),
    )


@exportable(order=10)
class Reminder(OwnedRecord, Target, Base):
    __tablename__ = "reminders"
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    time_zone: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(
        String(20), default="open", server_default="open"
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    intent_id: Mapped[str] = mapped_column(String(36))
    __table_args__ = (
        CheckConstraint(f"{TARGET_COUNT} <= 1", name="ck_reminder_one_target"),
        CheckConstraint(
            "state IN ('open','done','dismissed')", name="ck_reminder_state"
        ),
        CheckConstraint(
            "kind IN ('application_deadline','reply_to_company','interview','interview_preparation','task_submission','recruiter_follow_up','expected_feedback')",
            name="ck_reminder_kind",
        ),
        UniqueConstraint("user_id", "intent_id", name="uq_reminder_owner_intent"),
    )


@exportable(order=9)
class ApplicationContact(OwnedRecord, Base):
    __tablename__ = "application_contacts"
    application_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="CASCADE"), index=True
    )
    __table_args__ = (
        UniqueConstraint("application_id", "contact_id", name="uq_application_contact"),
    )


@exportable(order=9)
class RoundContact(OwnedRecord, Base):
    __tablename__ = "round_contacts"
    round_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="CASCADE"), index=True
    )
    __table_args__ = (
        UniqueConstraint("round_id", "contact_id", name="uq_round_contact"),
    )


@exportable(order=9)
class ApplicationDocument(OwnedRecord, Base):
    __tablename__ = "application_documents"
    application_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    file_path: Mapped[str] = mapped_column(String(500))
    original_filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(100))
    byte_count: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    __table_args__ = (
        CheckConstraint(
            "kind IN ('portfolio','task','solution','other')", name="ck_document_kind"
        ),
    )
