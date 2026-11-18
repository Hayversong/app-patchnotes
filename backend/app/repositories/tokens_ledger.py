"""Créditos (recargas) e extrato de consumo de tokens."""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TokenCredit, TokenUsage


async def add_credit(session: AsyncSession, user_id: uuid.UUID, amount: int) -> TokenCredit:
    credit = TokenCredit(user_id=user_id, amount=amount)
    session.add(credit)
    await session.flush()
    return credit


async def credits_between(session: AsyncSession, user_id: uuid.UUID, start: datetime, end: datetime) -> int:
    query = select(func.coalesce(func.sum(TokenCredit.amount), 0)).where(
        TokenCredit.user_id == user_id, TokenCredit.created_at >= start, TokenCredit.created_at < end,
    )
    return int(await session.scalar(query) or 0)


async def recent_usage(session: AsyncSession, user_id: uuid.UUID, limit: int) -> list[TokenUsage]:
    result = await session.scalars(
        select(TokenUsage).where(TokenUsage.user_id == user_id).order_by(TokenUsage.created_at.desc()).limit(limit)
    )
    return list(result)


async def recent_credits(session: AsyncSession, user_id: uuid.UUID, limit: int) -> list[TokenCredit]:
    result = await session.scalars(
        select(TokenCredit).where(TokenCredit.user_id == user_id).order_by(TokenCredit.created_at.desc()).limit(limit)
    )
    return list(result)
