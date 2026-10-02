"""Retired synthetic history migration; preserve revision ancestry and genuine data."""

from typing import Sequence

# revision identifiers, used by Alembic.
revision: str = "913e52a54449"
down_revision: str | Sequence[str] | None = "50dd97924e9f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Never manufacture or replace history on future upgrades.
    pass


def downgrade() -> None:
    # No generated rows can be distinguished safely; never delete real history.
    pass
