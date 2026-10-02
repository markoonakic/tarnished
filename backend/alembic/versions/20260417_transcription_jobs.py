"""One durable, non-exportable transcription request."""

import sqlalchemy as sa
from alembic import op

revision = "20260417_transcription_jobs"
down_revision = "20260416_recording_identity"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "transcription_jobs",
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
        sa.Column(
            "media_id",
            sa.String(36),
            sa.ForeignKey("round_media.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("intent_id", sa.String(36), nullable=False),
        sa.Column("retry_intents", sa.JSON(), nullable=False),
        sa.Column("source_path", sa.String(500), nullable=False),
        sa.Column("source_hash", sa.String(64)),
        *[
            sa.Column(name, sa.Integer(), nullable=False)
            for name in ("media_generation", "transcript_generation", "session_version")
        ],
        sa.Column("config_revision", sa.String(36), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("api_key_id", sa.String(36)),
        sa.Column("required_scopes", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("stage", sa.String(24), nullable=False),
        sa.Column("claim_id", sa.String(36)),
        sa.Column("uncertain", sa.Boolean(), nullable=False),
        sa.Column("error", sa.String(300)),
        sa.Column("checkpoints", sa.JSON(), nullable=False),
        sa.Column("coverage", sa.JSON(), nullable=False),
        sa.Column("result_id", sa.String(36)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "intent_id"),
    )
    for name in ("user_id", "round_id", "state"):
        op.create_index(f"ix_transcription_jobs_{name}", "transcription_jobs", [name])


def downgrade():
    op.drop_table("transcription_jobs")
