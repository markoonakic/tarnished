"""Immutable recording metadata and round media mutation generation."""

import sqlalchemy as sa
from alembic import op

revision = "20260416_recording_identity"
down_revision = "20260415_current_transcript"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "rounds",
        sa.Column("media_generation", sa.Integer(), nullable=False, server_default="0"),
    )
    for name, type_ in (
        ("sha256", sa.String(64)),
        ("byte_count", sa.Integer()),
        ("probed_duration_seconds", sa.Float()),
        ("validation", sa.String(32)),
    ):
        op.add_column("round_media", sa.Column(name, type_, nullable=True))


def downgrade():
    for name in ("validation", "probed_duration_seconds", "byte_count", "sha256"):
        op.drop_column("round_media", name)
    op.drop_column("rounds", "media_generation")
