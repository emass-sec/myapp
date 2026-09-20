"""make notes.owner_id NOT NULL

Fails (rather than deleting anything) if any note still has no owner.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    orphans = op.get_bind().scalar(sa.text("SELECT count(*) FROM notes WHERE owner_id IS NULL"))
    if orphans:
        raise RuntimeError(
            f"Cannot make notes.owner_id NOT NULL: {orphans} note(s) have no owner. "
            "Assign or remove them manually, then re-run the migration."
        )
    op.alter_column("notes", "owner_id", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    op.alter_column("notes", "owner_id", existing_type=sa.Integer(), nullable=True)
