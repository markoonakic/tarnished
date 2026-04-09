import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.database import Base
from app.core.reference_names import normalize_reference_name, normalized_reference_name
from app.services.export_registry import exportable


@exportable(order=3)
class RoundType(Base):
    __tablename__ = "round_types"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    user = relationship("User", back_populates="custom_round_types")
    rounds = relationship("Round", back_populates="round_type")

    @validates("name")
    def _set_normalized_name(self, key: str, value: str) -> str:
        normalized = normalize_reference_name(value)
        self.normalized_name = normalized_reference_name(normalized)
        return normalized


Index(
    "uq_round_types_global_name_ci",
    RoundType.normalized_name,
    unique=True,
    sqlite_where=RoundType.user_id.is_(None),
    postgresql_where=RoundType.user_id.is_(None),
)

Index(
    "uq_round_types_user_name_ci",
    RoundType.user_id,
    RoundType.normalized_name,
    unique=True,
    sqlite_where=RoundType.user_id.is_not(None),
    postgresql_where=RoundType.user_id.is_not(None),
)
