"""add_api_key_presets_and_scopes

Revision ID: 20260409_api_key_scopes
Revises: 20260409_api_keys
Create Date: 2026-04-09 11:20:00.000000

"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.api_key_scopes import FULL_ACCESS_PRESET, resolve_scopes_for_preset

# revision identifiers, used by Alembic.
revision: str = "20260409_api_key_scopes"
down_revision: str | Sequence[str] | None = "20260409_api_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    default_scopes = json.dumps(resolve_scopes_for_preset(FULL_ACCESS_PRESET))

    with op.batch_alter_table("user_api_keys", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "preset",
                sa.String(length=50),
                nullable=False,
                server_default=FULL_ACCESS_PRESET,
            )
        )
        batch_op.add_column(
            sa.Column(
                "scopes",
                sa.JSON(),
                nullable=False,
                server_default=default_scopes,
            )
        )

    with op.batch_alter_table("user_api_keys", schema=None) as batch_op:
        batch_op.alter_column("preset", server_default=None)
        batch_op.alter_column("scopes", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("user_api_keys", schema=None) as batch_op:
        batch_op.drop_column("scopes")
        batch_op.drop_column("preset")
