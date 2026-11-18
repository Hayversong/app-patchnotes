"""versão de sessão no lugar de tokens_valid_after

Access tokens passam a carregar a claim "sv" (users.session_version). A redefinição de senha incrementa a
versão, recusando na hora os tokens anteriores, sem a janela de 1 s da comparação por horário (iat).

Revision ID: 0002
Revises: 0001
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("session_version", sa.Integer(), server_default="0", nullable=False))
    op.drop_column("users", "tokens_valid_after")


def downgrade() -> None:
    op.add_column("users", sa.Column("tokens_valid_after", sa.DateTime(timezone=True), nullable=True))
    op.drop_column("users", "session_version")
