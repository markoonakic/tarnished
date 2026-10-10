"""Track API key permission and label revisions."""

import sqlalchemy as sa
from alembic import op

revision = "20261013_api_key_revision"
down_revision = "20261012_report_inputs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_api_keys",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("user_api_keys", "revision")
