import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.services.export_registry import exportable


@exportable(order=2)
class ApplicationStatus(Base):
    __tablename__ = "application_statuses"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#83a598")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    order: Mapped[int] = mapped_column(Integer, default=0)

    user = relationship("User", back_populates="custom_statuses")
    applications = relationship("Application", back_populates="status")


Index(
    "uq_application_statuses_global_name_ci",
    func.lower(func.trim(ApplicationStatus.name)),
    unique=True,
    sqlite_where=ApplicationStatus.user_id.is_(None),
    postgresql_where=ApplicationStatus.user_id.is_(None),
)

Index(
    "uq_application_statuses_user_name_ci",
    ApplicationStatus.user_id,
    func.lower(func.trim(ApplicationStatus.name)),
    unique=True,
    sqlite_where=ApplicationStatus.user_id.is_not(None),
    postgresql_where=ApplicationStatus.user_id.is_not(None),
)
