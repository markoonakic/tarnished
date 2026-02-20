import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.services.export_registry import exportable


@exportable(order=0)
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    api_token: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # hashed token for extension auth
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    settings: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    current_streak: Mapped[int] = mapped_column(default=0, nullable=False)
    longest_streak: Mapped[int] = mapped_column(default=0, nullable=False)
    total_activity_days: Mapped[int] = mapped_column(default=0, nullable=False)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ember_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    streak_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    streak_exhausted_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))

    applications = relationship(
        "Application", back_populates="user", cascade="all, delete-orphan"
    )
    custom_statuses = relationship(
        "ApplicationStatus", back_populates="user", cascade="all, delete-orphan"
    )
    custom_round_types = relationship(
        "RoundType", back_populates="user", cascade="all, delete-orphan"
    )
    user_profile = relationship(
        "UserProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
