"""Reviewed extraction, profile match and preparation on the shared executor."""

import sqlalchemy as sa
from alembic import op

revision = "20261010_job_analyses"
down_revision = "20261009_workspace"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("applications", sa.Column("posted_date", sa.Date(), nullable=True))
    op.create_table(
        "job_analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lead_id", sa.String(36), sa.ForeignKey("job_leads.id", ondelete="CASCADE")
        ),
        sa.Column(
            "application_id",
            sa.String(36),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "round_id", sa.String(36), sa.ForeignKey("rounds.id", ondelete="CASCADE")
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("input_revisions", sa.JSON(), nullable=False),
        sa.Column("language", sa.String(10), nullable=False),
        sa.Column("draft", sa.JSON(), nullable=False),
        sa.Column("reviewed", sa.JSON(), nullable=False),
        sa.Column("review_state", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(lead_id IS NOT NULL AND application_id IS NULL) OR (lead_id IS NULL AND application_id IS NOT NULL)",
            name="ck_analysis_target",
        ),
        sa.CheckConstraint(
            "kind IN ('EXTRACTION', 'PROFILE_MATCH', 'PREPARATION')",
            name="ck_analysis_kind",
        ),
        sa.CheckConstraint(
            "(kind = 'PREPARATION' AND round_id IS NOT NULL AND application_id IS NOT NULL) OR (kind != 'PREPARATION' AND round_id IS NULL)",
            name="ck_analysis_round",
        ),
    )
    for field in ("user_id", "lead_id", "application_id", "round_id"):
        op.create_index("ix_job_analyses_" + field, "job_analyses", [field])
    with op.batch_alter_table("interview_jobs") as batch:
        batch.add_column(sa.Column("analysis_id", sa.String(36)))
        batch.create_foreign_key(
            "fk_interview_job_analysis",
            "job_analyses",
            ["analysis_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_index("ix_interview_jobs_analysis_id", ["analysis_id"])


def downgrade():
    with op.batch_alter_table("interview_jobs") as batch:
        batch.drop_index("ix_interview_jobs_analysis_id")
        batch.drop_constraint("fk_interview_job_analysis", type_="foreignkey")
        batch.drop_column("analysis_id")
    op.drop_table("job_analyses")
    with op.batch_alter_table("applications") as batch:
        batch.drop_column("posted_date")
