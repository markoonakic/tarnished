"""Latest interview feedback and bounded durable analysis intent."""

import sqlalchemy as sa
from alembic import op

revision = "20260418_interview_feedback"
down_revision = "20260417_transcription_jobs"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "rounds",
        sa.Column(
            "interview_generation", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column("rounds", sa.Column("interview_report", sa.JSON(none_as_null=True)))
    op.add_column("rounds", sa.Column("interview_report_reason", sa.String(100)))
    for name in ("cv_text", "cover_letter_text"):
        op.add_column("applications", sa.Column(name, sa.Text()))
    op.create_table(
        "interview_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "round_id",
            sa.String(36),
            sa.ForeignKey("rounds.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("intent_id", sa.String(36), nullable=False),
        *[
            sa.Column(name, sa.Integer(), nullable=False)
            for name in ("generation", "session_version", "total_sections")
        ],
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("manifest", sa.JSON(), nullable=False),
        sa.Column("config_revision", sa.String(36), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("api_key_id", sa.String(36)),
        sa.Column("required_scopes", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("claim_id", sa.String(36)),
        sa.Column("uncertain", sa.Boolean(), nullable=False),
        sa.Column("error", sa.String(300)),
        sa.Column("checkpoints", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "intent_id"),
    )
    for name in ("user_id", "round_id", "state"):
        op.create_index(f"ix_interview_jobs_{name}", "interview_jobs", [name])


def downgrade():
    op.drop_table("interview_jobs")
    for name in ("cv_text", "cover_letter_text"):
        op.drop_column("applications", name)
    for name in ("interview_report_reason", "interview_report", "interview_generation"):
        op.drop_column("rounds", name)
