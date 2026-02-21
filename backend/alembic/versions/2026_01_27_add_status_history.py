"""add application status history

Revision ID: 20260127_add_status_history
Revises: 20260127_add_status_order
Create Date: 2026-01-27 00:00:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import func

# revision identifiers, used by Alembic.
revision: str = "20260127_add_status_history"
down_revision: str | Sequence[str] | None = "20260127_add_status_order"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create application_status_history table
    op.create_table(
        "application_status_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "application_id",
            sa.String(36),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "from_status_id",
            sa.String(36),
            sa.ForeignKey("application_statuses.id"),
            nullable=True,
        ),
        sa.Column(
            "to_status_id",
            sa.String(36),
            sa.ForeignKey("application_statuses.id"),
            nullable=False,
        ),
        sa.Column(
            "changed_at", sa.DateTime(), nullable=False, server_default=func.now()
        ),
        sa.Column("note", sa.Text(), nullable=True),
    )

    # Create indexes
    op.create_index(
        "ix_status_history_app", "application_status_history", ["application_id"]
    )
    op.create_index(
        "ix_status_history_changed_at", "application_status_history", ["changed_at"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop indexes
    op.drop_index(
        "ix_status_history_changed_at", table_name="application_status_history"
    )
    op.drop_index("ix_status_history_app", table_name="application_status_history")

    # Drop table
    op.drop_table("application_status_history")
