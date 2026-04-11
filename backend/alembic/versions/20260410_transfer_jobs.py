"""add transfer jobs table

Revision ID: 20260410_transfer_jobs
Revises: 20260409_joblead_url_uq
Create Date: 2026-04-10 19:05:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260410_transfer_jobs"
down_revision: str | Sequence[str] | None = "20260409_joblead_url_uq"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transfer_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("job_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("stage", sa.String(length=100), nullable=True),
        sa.Column("percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("source_path", sa.Text(), nullable=True),
        sa.Column("artifact_path", sa.Text(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_transfer_jobs_job_type"), "transfer_jobs", ["job_type"], unique=False
    )
    op.create_index(
        op.f("ix_transfer_jobs_status"), "transfer_jobs", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_transfer_jobs_user_id"), "transfer_jobs", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_transfer_jobs_user_id"), table_name="transfer_jobs")
    op.drop_index(op.f("ix_transfer_jobs_status"), table_name="transfer_jobs")
    op.drop_index(op.f("ix_transfer_jobs_job_type"), table_name="transfer_jobs")
    op.drop_table("transfer_jobs")
