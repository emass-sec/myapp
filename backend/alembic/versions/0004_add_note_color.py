"""add notes.color

Nullable, no server default: existing rows stay unlabeled and the previous
application version (which doesn't know the column) keeps working.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("color", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("notes", "color")
