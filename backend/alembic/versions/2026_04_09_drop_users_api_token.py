"""drop_users_api_token

Revision ID: 20260409_api_keys
Revises: 1620010fcb40
Create Date: 2026-04-09 09:45:00.000000

"""

from collections.abc import Sequence
from datetime import UTC, datetime
import hashlib
import hmac
import uuid

from alembic import op
import sqlalchemy as sa

from app.core.config import get_settings

# revision identifiers, used by Alembic.
revision: str = "20260409_api_keys"
down_revision: str | Sequence[str] | None = "1620010fcb40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "user_api_keys",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("key_prefix", sa.String(length=32), nullable=False),
        sa.Column("key_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_user_api_keys_user_id"),
        "user_api_keys",
        ["user_id"],
        unique=False,
    )

    settings = get_settings()
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, api_token FROM users WHERE api_token IS NOT NULL"))
    created_at = datetime.now(UTC)

    for row in rows:
        raw_key = row.api_token
        if not raw_key:
            continue

        key_hash = hmac.new(
            settings.secret_key.encode(),
            raw_key.encode(),
            hashlib.sha256,
        ).hexdigest()

        bind.execute(
            sa.text(
                """
                INSERT INTO user_api_keys (
                    id, user_id, label, key_prefix, key_hash, created_at, last_used_at, revoked_at
                ) VALUES (
                    :id, :user_id, :label, :key_prefix, :key_hash, :created_at, NULL, NULL
                )
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "user_id": row.id,
                "label": "Migrated Legacy Key",
                "key_prefix": raw_key[:8],
                "key_hash": key_hash,
                "created_at": created_at,
            },
        )

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("api_token")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("api_token", sa.String(length=255), nullable=True))
    op.drop_index(op.f("ix_user_api_keys_user_id"), table_name="user_api_keys")
    op.drop_table("user_api_keys")
