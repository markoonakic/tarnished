"""Language preference and stable identities for translated built-in labels."""

import sqlalchemy as sa
from alembic import op

revision = "20261008_language"
down_revision = "20260419_report_scopes"
branch_labels = None
depends_on = None

BUILTINS = {
    "application_statuses": {
        "Applied": "applied",
        "Screening": "screening",
        "Interviewing": "interviewing",
        "Offer": "offer",
        "Accepted": "accepted",
        "Rejected": "rejected",
        "Withdrawn": "withdrawn",
        "No Reply": "no_reply",
    },
    "round_types": {
        "Phone Screen": "phone_screen",
        "Technical": "technical",
        "Behavioral": "behavioral",
        "Take-home": "take_home",
        "Onsite": "onsite",
        "Final": "final",
    },
}


def upgrade():
    connection = op.get_bind()
    for name, labels in BUILTINS.items():
        op.add_column(name, sa.Column("builtin_key", sa.String(40), nullable=True))
        table = sa.table(
            name,
            sa.column("name"),
            sa.column("builtin_key"),
            sa.column("user_id"),
            sa.column("is_default"),
        )
        for label, key in labels.items():
            connection.execute(
                table.update()
                .where(
                    table.c.user_id.is_(None),
                    table.c.is_default.is_(True),
                    table.c.name == label,
                )
                .values(builtin_key=key)
            )
    users = sa.table("users", sa.column("id"), sa.column("settings", sa.JSON))
    for row in connection.execute(sa.select(users.c.id, users.c.settings)).mappings():
        preferences = dict(row["settings"]) if isinstance(row["settings"], dict) else {}
        preferences.setdefault("language", "en")
        connection.execute(
            users.update().where(users.c.id == row["id"]).values(settings=preferences)
        )


def downgrade():
    for name in BUILTINS:
        with op.batch_alter_table(name) as batch:
            batch.drop_column("builtin_key")
    connection = op.get_bind()
    users = sa.table("users", sa.column("id"), sa.column("settings", sa.JSON))
    for row in connection.execute(sa.select(users.c.id, users.c.settings)).mappings():
        if isinstance(row["settings"], dict):
            preferences = dict(row["settings"])
            preferences.pop("language", None)
            connection.execute(
                users.update()
                .where(users.c.id == row["id"])
                .values(settings=preferences)
            )
