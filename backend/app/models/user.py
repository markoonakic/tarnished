import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.sqlite import JSON

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    settings: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    current_streak: Mapped[int] = mapped_column(default=0, nullable=False)
    longest_streak: Mapped[int] = mapped_column(default=0, nullable=False)
    total_activity_days: Mapped[int] = mapped_column(default=0, nullable=False)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ember_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    streak_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    applications = relationship("Application", back_populates="user", cascade="all, delete-orphan")
    custom_statuses = relationship("ApplicationStatus", back_populates="user", cascade="all, delete-orphan")
    custom_round_types = relationship("RoundType", back_populates="user", cascade="all, delete-orphan")
