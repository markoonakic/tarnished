"""Report input compatibility marker; existing JSON columns need no data rewrite.

Older reports remain readable. New optional evidence snapshots are saved only
on explicit generation, not inferred from mutable records during migration.
"""

revision = "20261012_report_inputs"
down_revision = "20261011_patch_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
