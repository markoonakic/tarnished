"""Prospective meanings and explicit evidence; never reconstruct legacy history."""

import sqlalchemy as sa
from alembic import op

revision = "20260413_application_evidence"
down_revision = "20260412_account_sessions"
branch_labels = None
depends_on = None

MEANINGS = "'unknown','applied','screening','interviewing','offer','accepted','rejected','withdrawn','no_reply'"
PROVENANCE = "'recorded','legacy_unknown'"


def upgrade() -> None:
    # Column checks avoid recreating the referenced applications table on SQLite.
    op.add_column(
        "application_statuses",
        sa.Column(
            "meaning",
            sa.String(20),
            sa.CheckConstraint(f"meaning IN ({MEANINGS})", name="ck_status_meaning"),
            nullable=False,
            server_default="unknown",
        ),
    )
    # Only built-in definitions gain prospective meanings. Existing observations
    # remain unknown regardless of a familiar label's spelling.
    for name, meaning in [
        ("Applied", "applied"),
        ("Screening", "screening"),
        ("Interviewing", "interviewing"),
        ("Offer", "offer"),
        ("Accepted", "accepted"),
        ("Rejected", "rejected"),
        ("Withdrawn", "withdrawn"),
        ("No Reply", "no_reply"),
    ]:
        op.get_bind().execute(
            sa.text(
                "UPDATE application_statuses SET meaning = :meaning WHERE name = :name AND user_id IS NULL AND is_default = true"
            ),
            {"name": name, "meaning": meaning},
        )
    for column in [
        sa.Column(
            "status_meaning",
            sa.String(20),
            sa.CheckConstraint(
                f"status_meaning IN ({MEANINGS})", name="ck_application_status_meaning"
            ),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column(
            "status_meaning_provenance",
            sa.String(20),
            sa.CheckConstraint(
                f"status_meaning_provenance IN ({PROVENANCE})",
                name="ck_application_status_meaning_provenance",
            ),
            nullable=False,
            server_default="legacy_unknown",
        ),
        sa.Column(
            "evidence_revision",
            sa.Integer(),
            sa.CheckConstraint(
                "evidence_revision >= 0", name="ck_application_evidence_revision"
            ),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "response_state",
            sa.String(20),
            nullable=False,
            server_default="legacy_unknown",
        ),
        sa.Column("response_occurred_on", sa.Date()),
        sa.Column("response_recorded_at", sa.DateTime(timezone=True)),
        sa.Column(
            "response_reference",
            sa.Text(),
            sa.CheckConstraint(
                "(response_state = 'recorded' AND response_recorded_at IS NOT NULL) OR (response_state IN ('not_recorded','legacy_unknown') AND response_occurred_on IS NULL AND response_recorded_at IS NULL AND response_reference IS NULL)",
                name="ck_application_response",
            ),
        ),
    ]:
        op.add_column("applications", column)
    with op.batch_alter_table("application_status_history") as batch:
        batch.alter_column("to_status_id", existing_type=sa.String(36), nullable=True)
        for field in ("from_meaning", "to_meaning"):
            batch.add_column(sa.Column(field, sa.String(20)))
            batch.create_check_constraint(
                f"ck_history_{field}", f"{field} IS NULL OR {field} IN ({MEANINGS})"
            )
        for field in (
            "from_meaning_provenance",
            "to_meaning_provenance",
            "time_provenance",
        ):
            batch.add_column(
                sa.Column(
                    field,
                    sa.String(20),
                    nullable=False,
                    server_default="legacy_unknown",
                )
            )
            batch.create_check_constraint(
                f"ck_history_{field}", f"{field} IN ({PROVENANCE})"
            )
        batch.add_column(
            sa.Column("is_gap", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(sa.Column("corrected_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("correction_note", sa.Text()))
        batch.create_check_constraint(
            "ck_history_recorded_meaning",
            "(to_meaning_provenance != 'recorded' OR to_meaning IS NOT NULL) AND (from_meaning_provenance != 'recorded' OR from_status_id IS NULL OR from_meaning IS NOT NULL)",
        )
        batch.create_check_constraint(
            "ck_history_gap",
            "(is_gap AND from_status_id IS NULL AND to_status_id IS NULL AND from_meaning IS NULL AND to_meaning IS NULL AND note IS NULL AND corrected_at IS NULL AND correction_note IS NULL) OR (NOT is_gap AND to_status_id IS NOT NULL)",
        )


def downgrade() -> None:
    # A pre-evidence schema cannot represent gaps or independent provenance.
    # Refuse rather than delete genuine rows or silently discard their meaning.
    raise RuntimeError(
        "Evidence migration downgrade would lose evidence; restore an isolated pre-upgrade backup instead"
    )
