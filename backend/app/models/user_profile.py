import uuid

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.services.export_registry import exportable


@exportable(order=1)
class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    revision: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    permission_revision: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    ai_permissions: Mapped[dict] = mapped_column(
        JSON, default=dict, server_default="{}"
    )
    display_name: Mapped[str | None] = mapped_column(String(255))
    desired_positions: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    fields_of_work: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    seniority: Mapped[str | None] = mapped_column(String(50))
    work_modes: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    employment_types: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    years_experience: Mapped[float | None] = mapped_column(Float)
    location_restrictions: Mapped[str | None] = mapped_column(Text)
    skill_items: Mapped[list[dict]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    technologies: Mapped[list[dict]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    projects: Mapped[list[dict]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    certificates: Mapped[list[dict]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    languages: Mapped[list[dict]] = mapped_column(
        JSON, default=list, server_default="[]"
    )

    # Personal info
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Work authorization
    authorized_to_work: Mapped[str | None] = mapped_column(String(100), nullable=True)
    requires_sponsorship: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Extended profile (JSON)
    work_history: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    education: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    skills: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    # Relationships
    user = relationship("User", back_populates="user_profile")

    def __repr__(self) -> str:
        return f"<UserProfile(id={self.id}, user_id={self.user_id})>"
