"""Keep unknown sent dates nullable and remove any old database default."""

import sqlalchemy as sa
from alembic import op

revision = "20261011_patch_defaults"
down_revision = "20261010_job_analyses"
branch_labels = None
depends_on = None


def upgrade():
    # Current schemas have no SQL default. Do not rebuild or rewrite their records.
    columns = sa.inspect(op.get_bind()).get_columns("applications")
    applied_at = next(column for column in columns if column["name"] == "applied_at")
    if applied_at.get("default") is not None:
        with op.batch_alter_table("applications") as batch:
            batch.alter_column(
                "applied_at", existing_type=sa.Date(), server_default=None
            )


def downgrade():
    # An unknown sent date must not become today's date on restore.
    pass
