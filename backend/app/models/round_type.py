import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.services.export_registry import exportable


@exportable(order=3)
class RoundType(Base):
    __tablename__ = "round_types"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    user = relationship("User", back_populates="custom_round_types")
    rounds = relationship("Round", back_populates="round_type")


Index(
    "uq_round_types_global_name_ci",
    func.lower(func.trim(RoundType.name)),
    unique=True,
    sqlite_where=RoundType.user_id.is_(None),
    postgresql_where=RoundType.user_id.is_(None),
)

Index(
    "uq_round_types_user_name_ci",
    RoundType.user_id,
    func.lower(func.trim(RoundType.name)),
    unique=True,
    sqlite_where=RoundType.user_id.is_not(None),
    postgresql_where=RoundType.user_id.is_not(None),
)
