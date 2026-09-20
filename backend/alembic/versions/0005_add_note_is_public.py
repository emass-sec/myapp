"""add notes.is_public

NOT NULL with a server default of false, so the previous application version
(which doesn't know the column) keeps inserting rows without it.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_notes_public_created", "notes", ["is_public", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_notes_public_created", table_name="notes")
    op.drop_column("notes", "is_public")
