"""add_transcript_original_filename

Revision ID: 1620010fcb40
Revises: add_original_filename_app
Create Date: 2026-03-06 13:54:28.416066

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1620010fcb40"
down_revision: str | Sequence[str] | None = "add_original_filename_app"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "rounds",
        sa.Column("transcript_original_filename", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("rounds", "transcript_original_filename")
