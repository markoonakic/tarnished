"""Version sessions and permanently close owner bootstrap on initialized databases."""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "20260412_account_sessions"
down_revision = "20260411_job_lead_fk_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
    )
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT id FROM users LIMIT 1")).first():
        settings = sa.table(
            "system_settings",
            sa.column("id"),
            sa.column("key"),
            sa.column("value"),
            sa.column("created_at", sa.DateTime(timezone=True)),
            sa.column("updated_at", sa.DateTime(timezone=True)),
        )
        if not connection.execute(
            sa.select(settings.c.id).where(settings.c.key == "owner_bootstrapped")
        ).first():
            now = datetime.now(UTC)
            connection.execute(
                settings.insert().values(
                    id=str(uuid.uuid4()),
                    key="owner_bootstrapped",
                    value="true",
                    created_at=now,
                    updated_at=now,
                )
            )


def downgrade() -> None:
    # Never reopen setup by deleting the permanent marker.
    op.drop_column("users", "session_version")
