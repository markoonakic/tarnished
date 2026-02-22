"""add_original_filename_to_round_media

Revision ID: 09c3928e1529
Revises: 0d7e13252286
Create Date: 2026-02-22 09:32:40.399460

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "09c3928e1529"
down_revision: str | Sequence[str] | None = "0d7e13252286"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "round_media", sa.Column("original_filename", sa.String(255), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("round_media", "original_filename")
