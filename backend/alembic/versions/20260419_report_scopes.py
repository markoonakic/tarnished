"""Application and pipeline report scopes on the shared bounded job table."""

import sqlalchemy as sa
from alembic import op

revision = "20260419_report_scopes"
down_revision = "20260418_interview_feedback"
branch_labels = None
depends_on = None


def upgrade():
    # One shared job table serves all report scopes. INTERVIEW keeps round_id;
    # APPLICATION uses application_id; PIPELINE uses neither. Existing rows are
    # interview jobs, so the server default backfills them correctly.
    # batch_alter_table keeps the added foreign key and the round_id nullability
    # change working on SQLite as well as PostgreSQL.
    with op.batch_alter_table("interview_jobs") as batch:
        batch.add_column(
            sa.Column(
                "scope", sa.String(16), nullable=False, server_default="INTERVIEW"
            )
        )
        batch.add_column(
            sa.Column(
                "application_id",
                sa.String(36),
                sa.ForeignKey(
                    "applications.id",
                    ondelete="CASCADE",
                    name="fk_interview_jobs_application_id_applications",
                ),
            )
        )
        batch.alter_column("round_id", existing_type=sa.String(36), nullable=True)
        batch.create_index("ix_interview_jobs_scope", ["scope"])
        batch.create_index("ix_interview_jobs_application_id", ["application_id"])
    for table, columns in (
        (
            "applications",
            (
                sa.Column(
                    "report_generation",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                ),
                sa.Column("report", sa.JSON(none_as_null=True)),
                sa.Column("report_reason", sa.String(100)),
            ),
        ),
        (
            "users",
            (
                sa.Column(
                    "pipeline_generation",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                ),
                sa.Column("pipeline_report", sa.JSON(none_as_null=True)),
                sa.Column("pipeline_report_reason", sa.String(100)),
            ),
        ),
    ):
        for column in columns:
            op.add_column(table, column)


def downgrade():
    raise RuntimeError(
        "Report-scope downgrade would discard retained bounded report intent and results"
    )
