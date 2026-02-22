"""Add original_filename columns for CV and cover letter to Application

Revision ID: add_original_filename_app
Revises: fb5feec1a36e
Create Date: 2026-02-22

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_original_filename_app"
down_revision: str | None = "09c3928e1529"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add original filename columns for CV and cover letter
    op.add_column(
        "applications",
        sa.Column("cv_original_filename", sa.String(255), nullable=True),
    )
    op.add_column(
        "applications",
        sa.Column("cover_letter_original_filename", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("applications", "cover_letter_original_filename")
    op.drop_column("applications", "cv_original_filename")
