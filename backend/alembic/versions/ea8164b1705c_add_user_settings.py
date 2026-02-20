"""add user settings

Revision ID: ea8164b1705c
Revises: 20260127_add_status_history
Create Date: 2026-01-27 22:40:34.219057

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import table, column, update


# revision identifiers, used by Alembic.
revision: str = 'ea8164b1705c'
down_revision: Union[str, Sequence[str], None] = '20260127_add_status_history'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add settings column as JSON
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('settings', sa.JSON(), nullable=True))

    # Set default settings for existing users using SQLAlchemy Core
    # This is cross-database compatible (works on both PostgreSQL and SQLite)
    users = table('users', column('settings'))
    op.execute(
        update(users)
        .where(users.c.settings.is_(None))
        .values(settings={
            'show_streak_stats': True,
            'show_needs_attention': True,
            'show_heatmap': True
        })
    )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('settings')
