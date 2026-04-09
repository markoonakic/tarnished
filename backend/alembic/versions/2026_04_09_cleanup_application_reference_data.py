"""cleanup application reference data and description field

Revision ID: 20260409_app_ref_cleanup
Revises: 20260409_api_key_scopes
Create Date: 2026-04-09 13:55:00.000000

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260409_app_ref_cleanup"
down_revision: str | Sequence[str] | None = "20260409_api_key_scopes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _normalize_name(value: str | None) -> str:
    return " ".join((value or "").strip().split())


def _dedupe_application_statuses(connection) -> None:
    statuses = sa.table(
        "application_statuses",
        sa.column("id", sa.String(36)),
        sa.column("name", sa.String()),
        sa.column("user_id", sa.String(36)),
        sa.column("is_default", sa.Boolean()),
        sa.column("order", sa.Integer()),
    )
    applications = sa.table(
        "applications",
        sa.column("id", sa.String(36)),
        sa.column("status_id", sa.String(36)),
    )
    history = sa.table(
        "application_status_history",
        sa.column("id", sa.String(36)),
        sa.column("from_status_id", sa.String(36)),
        sa.column("to_status_id", sa.String(36)),
    )

    rows = connection.execute(
        sa.select(
            statuses.c.id,
            statuses.c.name,
            statuses.c.user_id,
            statuses.c.is_default,
            statuses.c.order,
        )
    ).mappings()

    grouped: dict[tuple[str | None, str], list[dict]] = {}
    for row in rows:
        grouped.setdefault(
            (row["user_id"], _normalize_name(row["name"]).casefold()), []
        ).append(dict(row))

    for duplicates in grouped.values():
        duplicates.sort(
            key=lambda row: (
                0 if row["is_default"] else 1,
                row["order"] if row["order"] is not None else 999999,
                row["id"],
            )
        )
        keep = duplicates[0]
        normalized_name = _normalize_name(keep["name"])
        if keep["name"] != normalized_name:
            connection.execute(
                statuses.update()
                .where(statuses.c.id == keep["id"])
                .values(name=normalized_name)
            )

        for duplicate in duplicates[1:]:
            connection.execute(
                applications.update()
                .where(applications.c.status_id == duplicate["id"])
                .values(status_id=keep["id"])
            )
            connection.execute(
                history.update()
                .where(history.c.from_status_id == duplicate["id"])
                .values(from_status_id=keep["id"])
            )
            connection.execute(
                history.update()
                .where(history.c.to_status_id == duplicate["id"])
                .values(to_status_id=keep["id"])
            )
            connection.execute(
                statuses.delete().where(statuses.c.id == duplicate["id"])
            )


def _dedupe_round_types(connection) -> None:
    round_types = sa.table(
        "round_types",
        sa.column("id", sa.String(36)),
        sa.column("name", sa.String()),
        sa.column("user_id", sa.String(36)),
        sa.column("is_default", sa.Boolean()),
    )
    rounds = sa.table(
        "rounds",
        sa.column("id", sa.String(36)),
        sa.column("round_type_id", sa.String(36)),
    )

    rows = connection.execute(
        sa.select(
            round_types.c.id,
            round_types.c.name,
            round_types.c.user_id,
            round_types.c.is_default,
        )
    ).mappings()

    grouped: dict[tuple[str | None, str], list[dict]] = {}
    for row in rows:
        grouped.setdefault(
            (row["user_id"], _normalize_name(row["name"]).casefold()), []
        ).append(dict(row))

    for duplicates in grouped.values():
        duplicates.sort(
            key=lambda row: (
                0 if row["is_default"] else 1,
                row["id"],
            )
        )
        keep = duplicates[0]
        normalized_name = _normalize_name(keep["name"])
        if keep["name"] != normalized_name:
            connection.execute(
                round_types.update()
                .where(round_types.c.id == keep["id"])
                .values(name=normalized_name)
            )

        for duplicate in duplicates[1:]:
            connection.execute(
                rounds.update()
                .where(rounds.c.round_type_id == duplicate["id"])
                .values(round_type_id=keep["id"])
            )
            connection.execute(
                round_types.delete().where(round_types.c.id == duplicate["id"])
            )


def upgrade() -> None:
    connection = op.get_bind()

    connection.execute(
        sa.text(
            """
            UPDATE applications
            SET job_description = description
            WHERE (job_description IS NULL OR trim(job_description) = '')
              AND description IS NOT NULL
              AND trim(description) != ''
            """
        )
    )

    _dedupe_application_statuses(connection)
    _dedupe_round_types(connection)

    with op.batch_alter_table("applications", schema=None) as batch_op:
        batch_op.drop_column("description")

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


def downgrade() -> None:
    op.drop_index("uq_round_types_user_name_ci", table_name="round_types")
    op.drop_index("uq_round_types_global_name_ci", table_name="round_types")
    op.drop_index(
        "uq_application_statuses_user_name_ci", table_name="application_statuses"
    )
    op.drop_index(
        "uq_application_statuses_global_name_ci", table_name="application_statuses"
    )

    with op.batch_alter_table("applications", schema=None) as batch_op:
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))

    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            UPDATE applications
            SET description = job_description
            WHERE description IS NULL
              AND job_description IS NOT NULL
              AND trim(job_description) != ''
            """
        )
    )
