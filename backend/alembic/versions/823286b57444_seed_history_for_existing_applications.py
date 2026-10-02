"""Retired synthetic history migration; preserve revision ancestry and genuine data."""

from typing import Sequence

# revision identifiers, used by Alembic.
revision: str = "823286b57444"
down_revision: str | Sequence[str] | None = "a5dc88e4b7b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Never manufacture or replace history on future upgrades.
    pass


def downgrade() -> None:
    # No generated rows can be distinguished safely; never delete real history.
    pass
