import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, TokenUsage


async def add_message(session: AsyncSession, *, user_id: uuid.UUID, role: str, content: str, status: str, tokens_used: int | None = None, created_at: datetime | None = None) -> ChatMessage:
    message = ChatMessage(user_id=user_id, role=role, content=content, status=status, tokens_used=tokens_used)
    if created_at is not None:
        message.created_at = created_at
    session.add(message)
    await session.flush()
    return message


async def complete_message(session: AsyncSession, message_id: uuid.UUID, tokens_used: int) -> None:
    await session.execute(update(ChatMessage).where(ChatMessage.id == message_id).values(status="complete", tokens_used=tokens_used))


async def fail_message(session: AsyncSession, message_id: uuid.UUID) -> None:
    await session.execute(update(ChatMessage).where(ChatMessage.id == message_id, ChatMessage.status == "pending").values(status="failed"))


async def recent_complete(session: AsyncSession, user_id: uuid.UUID, limit: int) -> list[ChatMessage]:
    """Últimas `limit` mensagens concluídas, em ordem cronológica."""
    if limit <= 0:
        return []
    result = await session.scalars(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.status == "complete")
        .order_by(ChatMessage.created_at.desc(), ChatMessage.role.desc())
        .limit(limit)
    )
    return list(reversed(list(result)))


async def count_complete(session: AsyncSession, user_id: uuid.UUID) -> int:
    return await session.scalar(
        select(func.count()).select_from(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.status == "complete")
    ) or 0


async def add_usage(session: AsyncSession, *, user_id: uuid.UUID, message_id: uuid.UUID, model: str, prompt_tokens: int, completion_tokens: int, estimated: bool) -> None:
    session.add(TokenUsage(
        user_id=user_id, message_id=message_id, model=model, prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens, total_tokens=prompt_tokens + completion_tokens, estimated=estimated,
    ))
    await session.flush()


async def tokens_used_between(session: AsyncSession, user_id: uuid.UUID, start: datetime | None = None, end: datetime | None = None) -> int:
    query = select(func.coalesce(func.sum(TokenUsage.total_tokens), 0)).where(TokenUsage.user_id == user_id)
    if start is not None:
        query = query.where(TokenUsage.created_at >= start)
    if end is not None:
        query = query.where(TokenUsage.created_at < end)
    return int(await session.scalar(query) or 0)
