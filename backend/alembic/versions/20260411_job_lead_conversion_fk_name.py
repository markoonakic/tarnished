"""normalize postgres job lead conversion fk name

Revision ID: 20260411_job_lead_fk_name
Revises: 20260410_transfer_jobs
Create Date: 2026-04-11 10:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260411_job_lead_fk_name"
down_revision: str | Sequence[str] | None = "20260410_transfer_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEGACY_FK_NAME = "job_leads_converted_to_application_id_fkey"
TARGET_FK_NAME = "fk_job_leads_converted_to_application"


def _job_leads_constraint_exists(connection, constraint_name: str) -> bool:
    return (
        connection.execute(
            sa.text(
                """
                SELECT 1
                FROM pg_constraint AS con
                JOIN pg_class AS rel ON rel.oid = con.conrelid
                JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
                WHERE nsp.nspname = current_schema()
                  AND rel.relname = 'job_leads'
                  AND con.contype = 'f'
                  AND con.conname = :constraint_name
                """
            ),
            {"constraint_name": constraint_name},
        ).scalar()
        is not None
    )


def upgrade() -> None:
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return

    if _job_leads_constraint_exists(
        connection, LEGACY_FK_NAME
    ) and not _job_leads_constraint_exists(connection, TARGET_FK_NAME):
        op.execute(
            sa.text(
                f'ALTER TABLE job_leads RENAME CONSTRAINT "{LEGACY_FK_NAME}" TO "{TARGET_FK_NAME}"'
            )
        )


def downgrade() -> None:
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return

    if _job_leads_constraint_exists(
        connection, TARGET_FK_NAME
    ) and not _job_leads_constraint_exists(connection, LEGACY_FK_NAME):
        op.execute(
            sa.text(
                f'ALTER TABLE job_leads RENAME CONSTRAINT "{TARGET_FK_NAME}" TO "{LEGACY_FK_NAME}"'
            )
        )
