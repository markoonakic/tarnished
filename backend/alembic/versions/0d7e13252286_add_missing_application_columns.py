"""add_missing_application_columns

Revision ID: 0d7e13252286
Revises: fb5feec1a36e
Create Date: 2026-02-20 18:35:41.311717

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0d7e13252286'
down_revision: Union[str, Sequence[str], None] = 'fb5feec1a36e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Upgrade schema."""
    # Add missing columns that exist in model but were never migrated
    # These columns may already exist in some databases (manually added)
    with op.batch_alter_table('applications', schema=None) as batch_op:
        if not column_exists('applications', 'location'):
            batch_op.add_column(sa.Column('location', sa.String(255), nullable=True))
        if not column_exists('applications', 'recruiter_title'):
            batch_op.add_column(sa.Column('recruiter_title', sa.String(255), nullable=True))
        # Fix nullable constraints to match model
        batch_op.alter_column('requirements_must_have', existing_type=sa.JSON(), nullable=False)
        batch_op.alter_column('requirements_nice_to_have', existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('applications', schema=None) as batch_op:
        # Revert nullable constraints
        batch_op.alter_column('requirements_nice_to_have', existing_type=sa.JSON(), nullable=True)
        batch_op.alter_column('requirements_must_have', existing_type=sa.JSON(), nullable=True)
        if column_exists('applications', 'recruiter_title'):
            batch_op.drop_column('recruiter_title')
        if column_exists('applications', 'location'):
            batch_op.drop_column('location')
