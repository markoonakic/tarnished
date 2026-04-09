"""enforce per-user job lead url uniqueness

Revision ID: 20260409_joblead_url_uq
Revises: 30e6bafac1f1
Create Date: 2026-04-09 23:18:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260409_joblead_url_uq"
down_revision: str | None = "30e6bafac1f1"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Upgrade schema."""
    connection = op.get_bind()
    duplicates = connection.execute(
        sa.text(
            """
            SELECT user_id, url, COUNT(*) AS duplicate_count
            FROM job_leads
            GROUP BY user_id, url
            HAVING COUNT(*) > 1
            LIMIT 5
            """
        )
    ).fetchall()

    if duplicates:
        preview = ", ".join(
            f"{row.user_id}:{row.url} ({row.duplicate_count})" for row in duplicates
        )
        raise RuntimeError(
            "Cannot enforce uq_job_leads_user_url while duplicate job leads exist: "
            f"{preview}"
        )

    op.drop_index("ix_job_leads_user_url", table_name="job_leads")
    op.create_index(
        "uq_job_leads_user_url", "job_leads", ["user_id", "url"], unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_job_leads_user_url", table_name="job_leads")
    op.create_index("ix_job_leads_user_url", "job_leads", ["user_id", "url"], unique=False)
