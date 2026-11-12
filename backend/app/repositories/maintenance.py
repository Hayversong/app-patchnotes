"""Exclusões e marcações em lote para a rotina de manutenção (nunca chamadas no caminho de uma requisição).

Cada função processa no máximo `batch` linhas por chamada, apoiada em índice, para manter cada transação curta.
"""

from datetime import datetime

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, PasswordResetToken, RefreshToken


async def delete_expired_refresh_tokens(session: AsyncSession, cutoff: datetime, batch: int) -> int:
    """Refresh tokens vencidos antes de `cutoff`. Revogados continuam até vencer: são eles que detectam reuso."""
    ids = select(RefreshToken.id).where(RefreshToken.expires_at < cutoff).limit(batch).scalar_subquery()
    result = await session.execute(delete(RefreshToken).where(RefreshToken.id.in_(ids)))
    return result.rowcount or 0


async def delete_stale_reset_tokens(session: AsyncSession, cutoff: datetime, batch: int) -> int:
    """Tokens de redefinição vencidos ou usados antes de `cutoff` (já não servem para nada)."""
    stale = or_(PasswordResetToken.expires_at < cutoff, PasswordResetToken.used_at < cutoff)
    ids = select(PasswordResetToken.id).where(stale).limit(batch).scalar_subquery()
    result = await session.execute(delete(PasswordResetToken).where(PasswordResetToken.id.in_(ids)))
    return result.rowcount or 0


async def fail_orphan_pending_messages(session: AsyncSession, cutoff: datetime, batch: int) -> int:
    """Pedidos de chat que ficaram `pending` (processo encerrado no meio da geração) viram `failed`."""
    ids = (
        select(ChatMessage.id)
        .where(ChatMessage.status == "pending", ChatMessage.created_at < cutoff)
        .limit(batch)
        .scalar_subquery()
    )
    result = await session.execute(update(ChatMessage).where(ChatMessage.id.in_(ids)).values(status="failed"))
    return result.rowcount or 0
