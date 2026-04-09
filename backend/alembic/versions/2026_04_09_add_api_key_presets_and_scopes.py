"""add_api_key_presets_and_scopes

Revision ID: 2026_04_09_add_api_key_presets_and_scopes
Revises: 2026_04_09_drop_users_api_token
Create Date: 2026-04-09 11:20:00.000000

"""

from collections.abc import Sequence
import json

from alembic import op
import sqlalchemy as sa

from app.core.api_key_scopes import FULL_ACCESS_PRESET, resolve_scopes_for_preset

# revision identifiers, used by Alembic.
revision: str = "2026_04_09_add_api_key_presets_and_scopes"
down_revision: str | Sequence[str] | None = "2026_04_09_drop_users_api_token"
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
