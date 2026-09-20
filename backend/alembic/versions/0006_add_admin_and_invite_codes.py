"""add users.is_admin and invite_codes

Additive: is_admin has a server default of false, and invite_codes is a new table,
so the previous application version keeps working during a rollout.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-20
"""

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "created_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("max_uses >= 1", name="ck_invite_codes_max_uses"),
        sa.CheckConstraint("use_count >= 0", name="ck_invite_codes_use_count"),
    )


def downgrade() -> None:
    op.drop_table("invite_codes")
    op.drop_column("users", "is_admin")
