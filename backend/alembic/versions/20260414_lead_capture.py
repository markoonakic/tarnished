"""Retained source and request-bound lead enrichment, preserving existing rows."""

import sqlalchemy as sa
from alembic import op

revision = "20260414_lead_capture"
down_revision = "20260413_application_evidence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Inline checks/additions avoid rebuilding this referenced table on SQLite.
    for column in [
        sa.Column("source_text", sa.Text(), nullable=True),
        sa.Column(
            "source_truncated", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("content_warning", sa.Text(), nullable=True),
        sa.Column(
            "revision",
            sa.Integer(),
            sa.CheckConstraint("revision >= 0", name="ck_job_lead_revision"),
            nullable=False,
            server_default="0",
        ),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("manual_fields", sa.JSON(), nullable=False, server_default="[]"),
    ]:
        op.add_column("job_leads", column)


def downgrade() -> None:
    raise RuntimeError(
        "Lead capture downgrade would discard retained source and manual-correction intent"
    )
