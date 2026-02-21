"""fix json type for postgresql compatibility

Revision ID: 38dc3fecbac5
Revises: 3e450efb7235
Create Date: 2026-01-29 14:48:56.089789

"""

from typing import Sequence

# revision identifiers, used by Alembic.
revision: str = "38dc3fecbac5"
down_revision: str | Sequence[str] | None = "3e450efb7235"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    This migration tracks a Python-only change to the User model.
    The JSON import was changed from SQLite-specific to generic SQLAlchemy JSON.
    No database schema changes were needed - the column was already using sa.JSON().
    """
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
