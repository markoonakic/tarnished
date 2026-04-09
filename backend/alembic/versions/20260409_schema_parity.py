"""schema parity for postgres and sqlite

Revision ID: 20260409_schema_parity
Revises: 20260409_app_ref_cleanup
Create Date: 2026-04-09 14:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.reference_names import normalize_reference_name, normalized_reference_name

# revision identifiers, used by Alembic.
revision: str = "20260409_schema_parity"
down_revision: str | Sequence[str] | None = "20260409_app_ref_cleanup"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill_normalized_reference_names(connection) -> None:
    application_statuses = sa.table(
        "application_statuses",
        sa.column("id", sa.String(36)),
        sa.column("name", sa.String()),
        sa.column("normalized_name", sa.String()),
    )
    round_types = sa.table(
        "round_types",
        sa.column("id", sa.String(36)),
        sa.column("name", sa.String()),
        sa.column("normalized_name", sa.String()),
    )

    status_rows = connection.execute(
        sa.select(application_statuses.c.id, application_statuses.c.name)
    ).mappings()
    for row in status_rows:
        normalized_display_name = normalize_reference_name(row["name"] or "")
        connection.execute(
            application_statuses.update()
            .where(application_statuses.c.id == row["id"])
            .values(
                name=normalized_display_name,
                normalized_name=normalized_reference_name(normalized_display_name),
            )
        )

    round_type_rows = connection.execute(
        sa.select(round_types.c.id, round_types.c.name)
    ).mappings()
    for row in round_type_rows:
        normalized_display_name = normalize_reference_name(row["name"] or "")
        connection.execute(
            round_types.update()
            .where(round_types.c.id == row["id"])
            .values(
                name=normalized_display_name,
                normalized_name=normalized_reference_name(normalized_display_name),
            )
        )


def _upgrade_postgresql_timestamp_columns() -> None:
    timestamp_columns = [
        ("users", "created_at"),
        ("applications", "created_at"),
        ("applications", "updated_at"),
        ("audit_logs", "created_at"),
        ("job_leads", "scraped_at"),
        ("rounds", "scheduled_at"),
        ("rounds", "completed_at"),
        ("rounds", "created_at"),
        ("round_media", "uploaded_at"),
        ("system_settings", "created_at"),
        ("system_settings", "updated_at"),
    ]

    for table_name, column_name in timestamp_columns:
        op.execute(
            sa.text(
                f"""
                ALTER TABLE {table_name}
                ALTER COLUMN {column_name}
                TYPE TIMESTAMP WITH TIME ZONE
                USING {column_name} AT TIME ZONE 'UTC'
                """
            )
        )

    op.execute(
        sa.text(
            """
            ALTER TABLE application_status_history
            ALTER COLUMN changed_at DROP DEFAULT,
            ALTER COLUMN changed_at TYPE TIMESTAMP WITH TIME ZONE
            USING changed_at AT TIME ZONE 'UTC',
            ALTER COLUMN changed_at SET DEFAULT now()
            """
        )
    )

    op.execute(
        sa.text(
            "ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_key_key"
        )
    )


def _downgrade_postgresql_timestamp_columns() -> None:
    timestamp_columns = [
        ("users", "created_at"),
        ("applications", "created_at"),
        ("applications", "updated_at"),
        ("audit_logs", "created_at"),
        ("job_leads", "scraped_at"),
        ("rounds", "scheduled_at"),
        ("rounds", "completed_at"),
        ("rounds", "created_at"),
        ("round_media", "uploaded_at"),
        ("system_settings", "created_at"),
        ("system_settings", "updated_at"),
    ]

    for table_name, column_name in timestamp_columns:
        op.execute(
            sa.text(
                f"""
                ALTER TABLE {table_name}
                ALTER COLUMN {column_name}
                TYPE TIMESTAMP WITHOUT TIME ZONE
                USING {column_name} AT TIME ZONE 'UTC'
                """
            )
        )

    op.execute(
        sa.text(
            """
            ALTER TABLE application_status_history
            ALTER COLUMN changed_at DROP DEFAULT,
            ALTER COLUMN changed_at TYPE TIMESTAMP WITHOUT TIME ZONE
            USING changed_at AT TIME ZONE 'UTC',
            ALTER COLUMN changed_at SET DEFAULT now()
            """
        )
    )

    op.create_unique_constraint("system_settings_key_key", "system_settings", ["key"])


def upgrade() -> None:
    bind = op.get_bind()

    with op.batch_alter_table("application_statuses", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("normalized_name", sa.String(length=100), nullable=True)
        )

    with op.batch_alter_table("round_types", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("normalized_name", sa.String(length=100), nullable=True)
        )

    _backfill_normalized_reference_names(bind)

    with op.batch_alter_table("application_statuses", schema=None) as batch_op:
        batch_op.alter_column(
            "normalized_name", existing_type=sa.String(length=100), nullable=False
        )

    with op.batch_alter_table("round_types", schema=None) as batch_op:
        batch_op.alter_column(
            "normalized_name", existing_type=sa.String(length=100), nullable=False
        )

    op.execute(sa.text("DROP INDEX IF EXISTS uq_application_statuses_global_name_ci"))
    op.execute(sa.text("DROP INDEX IF EXISTS uq_application_statuses_user_name_ci"))
    op.execute(sa.text("DROP INDEX IF EXISTS uq_round_types_global_name_ci"))
    op.execute(sa.text("DROP INDEX IF EXISTS uq_round_types_user_name_ci"))

    op.create_index(
        "uq_application_statuses_global_name_ci",
        "application_statuses",
        ["normalized_name"],
        unique=True,
        sqlite_where=sa.text("user_id IS NULL"),
        postgresql_where=sa.text("user_id IS NULL"),
    )
    op.create_index(
        "uq_application_statuses_user_name_ci",
        "application_statuses",
        ["user_id", "normalized_name"],
        unique=True,
        sqlite_where=sa.text("user_id IS NOT NULL"),
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )
    op.create_index(
        "uq_round_types_global_name_ci",
        "round_types",
        ["normalized_name"],
        unique=True,
        sqlite_where=sa.text("user_id IS NULL"),
        postgresql_where=sa.text("user_id IS NULL"),
    )
    op.create_index(
        "uq_round_types_user_name_ci",
        "round_types",
        ["user_id", "normalized_name"],
        unique=True,
        sqlite_where=sa.text("user_id IS NOT NULL"),
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )

    if bind.dialect.name == "postgresql":
        _upgrade_postgresql_timestamp_columns()


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("uq_round_types_user_name_ci", table_name="round_types")
    op.drop_index("uq_round_types_global_name_ci", table_name="round_types")
    op.drop_index(
        "uq_application_statuses_user_name_ci", table_name="application_statuses"
    )
    op.drop_index(
        "uq_application_statuses_global_name_ci", table_name="application_statuses"
    )

    op.create_index(
        "uq_application_statuses_global_name_ci",
        "application_statuses",
        [sa.text("lower(trim(name))")],
        unique=True,
        sqlite_where=sa.text("user_id IS NULL"),
        postgresql_where=sa.text("user_id IS NULL"),
    )
    op.create_index(
        "uq_application_statuses_user_name_ci",
        "application_statuses",
        ["user_id", sa.text("lower(trim(name))")],
        unique=True,
        sqlite_where=sa.text("user_id IS NOT NULL"),
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )
    op.create_index(
        "uq_round_types_global_name_ci",
        "round_types",
        [sa.text("lower(trim(name))")],
        unique=True,
        sqlite_where=sa.text("user_id IS NULL"),
        postgresql_where=sa.text("user_id IS NULL"),
    )
    op.create_index(
        "uq_round_types_user_name_ci",
        "round_types",
        ["user_id", sa.text("lower(trim(name))")],
        unique=True,
        sqlite_where=sa.text("user_id IS NOT NULL"),
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )

    with op.batch_alter_table("round_types", schema=None) as batch_op:
        batch_op.drop_column("normalized_name")

    with op.batch_alter_table("application_statuses", schema=None) as batch_op:
        batch_op.drop_column("normalized_name")

    if bind.dialect.name == "postgresql":
        _downgrade_postgresql_timestamp_columns()
