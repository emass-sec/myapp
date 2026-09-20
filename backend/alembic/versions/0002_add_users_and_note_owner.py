"""add users, sessions, auth attempts and notes.owner_id

Existing notes are test data with no owner, so they are deleted here.
owner_id is nullable for now; a follow-up migration makes it NOT NULL.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-19
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=50), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_table(
        "auth_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_attempts_lookup", "auth_attempts", ["kind", "ip", "created_at"])

    op.add_column(
        "notes",
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE")),
    )
    op.create_index("ix_notes_owner_id", "notes", ["owner_id"])
    op.execute("DELETE FROM notes WHERE owner_id IS NULL")


def downgrade() -> None:
    op.drop_index("ix_notes_owner_id", table_name="notes")
    op.drop_column("notes", "owner_id")
    op.drop_table("auth_attempts")
    op.drop_table("sessions")
    op.drop_table("users")
