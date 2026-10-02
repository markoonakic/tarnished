"""Current editable transcript with a persistent destination generation."""

import sqlalchemy as sa
from alembic import op

revision = "20260415_current_transcript"
down_revision = "20260414_lead_capture"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rounds",
        sa.Column(
            "transcript_generation", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "rounds",
        sa.Column("current_transcript", sa.JSON(none_as_null=True), nullable=True),
    )


def downgrade() -> None:
    connection = op.get_bind()
    if connection.execute(
        sa.text(
            "SELECT 1 FROM rounds WHERE current_transcript IS NOT NULL OR transcript_generation <> 0 LIMIT 1"
        )
    ).first():
        raise RuntimeError(
            "Cannot downgrade while transcript content or generation evidence exists"
        )
    op.drop_column("rounds", "current_transcript")
    op.drop_column("rounds", "transcript_generation")
