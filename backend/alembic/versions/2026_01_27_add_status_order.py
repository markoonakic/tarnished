"""add order field to application_statuses

Revision ID: 20260127_add_status_order
Revises: 0ccd2c25e4cb
Create Date: 2026-01-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260127_add_status_order'
down_revision: Union[str, Sequence[str], None] = '0ccd2c25e4cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Check if order column exists, if not add it
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('application_statuses')]

    if 'order' not in columns:
        # Add order column as nullable first
        op.add_column('application_statuses', sa.Column('order', sa.Integer(), nullable=True))

    # Ensure order values are correct (1-indexed)
    op.execute("""
        UPDATE application_statuses
        SET "order" = CASE name
            WHEN 'Applied' THEN 1
            WHEN 'Screening' THEN 2
            WHEN 'Interviewing' THEN 3
            WHEN 'Offer' THEN 4
            WHEN 'Accepted' THEN 5
            WHEN 'Rejected' THEN 6
            WHEN 'Withdrawn' THEN 7
            WHEN 'No Reply' THEN 8
            WHEN 'On Hold' THEN 9
            ELSE 999
        END
    """)

    # Ensure the column is non-nullable
    if 'order' not in columns:
        op.alter_column('application_statuses', 'order', nullable=False)

    # Create index on order column if it doesn't exist
    indexes = [idx['name'] for idx in inspector.get_indexes('application_statuses')]
    if 'ix_application_statuses_order' not in indexes:
        op.create_index('ix_application_statuses_order', 'application_statuses', ['order'])


def downgrade() -> None:
    """Downgrade schema."""
    # Drop index
    op.drop_index('ix_application_statuses_order', table_name='application_statuses')

    # Drop order column
    op.drop_column('application_statuses', 'order')
