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
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('application_statuses')]
    column_existed = 'order' in columns

    if not column_existed:
        # Add order column as nullable first
        op.add_column('application_statuses', sa.Column('order', sa.Integer(), nullable=True))

    # Ensure order values are correct (1-indexed)
    # Use SQLAlchemy's text() for safe parameterized query execution
    from sqlalchemy import text, update, table, column
    application_statuses = table('application_statuses',
        column('name'),
        column('order')
    )

    # Build the CASE expression using SQLAlchemy expressions
    case_expression = sa.case(
        (application_statuses.c.name == 'Applied', 1),
        (application_statuses.c.name == 'Screening', 2),
        (application_statuses.c.name == 'Interviewing', 3),
        (application_statuses.c.name == 'Offer', 4),
        (application_statuses.c.name == 'Accepted', 5),
        (application_statuses.c.name == 'Rejected', 6),
        (application_statuses.c.name == 'Withdrawn', 7),
        (application_statuses.c.name == 'No Reply', 8),
        (application_statuses.c.name == 'On Hold', 9),
        else_=999
    )

    conn.execute(
        update(application_statuses)
        .values(order=case_expression)
    )

    if not column_existed:
        op.alter_column('application_statuses', 'order', nullable=False, server_default='0')

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
