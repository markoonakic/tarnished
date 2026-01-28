"""add streak tracking

Revision ID: a5dc88e4b7b6
Revises: ea8164b1705c
Create Date: 2026-01-28 10:14:24.220919

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5dc88e4b7b6'
down_revision: Union[str, Sequence[str], None] = 'ea8164b1705c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('current_streak', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('longest_streak', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('total_activity_days', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('last_activity_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('ember_active', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('streak_start_date', sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'streak_start_date')
    op.drop_column('users', 'ember_active')
    op.drop_column('users', 'last_activity_date')
    op.drop_column('users', 'total_activity_days')
    op.drop_column('users', 'longest_streak')
    op.drop_column('users', 'current_streak')
