"""cadastro com confirmação de e-mail

O cadastro deixa de criar a conta na hora: grava um pedido pendente e envia um link. A resposta é a mesma
para qualquer e-mail, então o cadastro não revela mais quais endereços têm conta.

Revision ID: 0005
Revises: 0004
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pending_registrations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pending_registrations")),
        sa.UniqueConstraint("email", name=op.f("uq_pending_registrations_email")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_pending_registrations_token_hash")),
    )
    op.create_index("ix_pending_registrations_expires_at", "pending_registrations", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_pending_registrations_expires_at", table_name="pending_registrations")
    op.drop_table("pending_registrations")
