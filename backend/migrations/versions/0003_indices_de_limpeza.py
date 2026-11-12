"""índices para a rotina de limpeza em lote

A limpeza (python -m app.scripts.cleanup) filtra por vencimento e por pedidos de chat pendentes; sem estes
índices, cada lote faria uma varredura completa da tabela.

Revision ID: 0003
Revises: 0002
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])
    op.create_index("ix_password_reset_tokens_expires_at", "password_reset_tokens", ["expires_at"])
    op.create_index("ix_password_reset_tokens_used_at", "password_reset_tokens", ["used_at"], postgresql_where=sa.text("used_at IS NOT NULL"))
    op.create_index("ix_chat_messages_pending_created", "chat_messages", ["created_at"], postgresql_where=sa.text("status = 'pending'"))


def downgrade() -> None:
    op.drop_index("ix_chat_messages_pending_created", table_name="chat_messages")
    op.drop_index("ix_password_reset_tokens_used_at", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_expires_at", table_name="password_reset_tokens")
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
