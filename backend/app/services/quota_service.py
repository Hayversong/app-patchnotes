import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import User
from app.repositories import chat as chat_repo
from app.repositories import tokens_ledger

# Pacotes da recarga simulada. Valores fixos evitam que o cliente escolha quantias arbitrárias.
RECHARGE_PACKAGES = (10_000, 50_000, 100_000)
HISTORY_MAX = 50


@dataclass(frozen=True)
class Balance:
    balance: int
    limit: int
    used: int
    credits: int
    period_start: datetime
    period_end: datetime


@dataclass(frozen=True)
class HistoryItem:
    id: uuid.UUID
    kind: Literal["usage", "recharge"]
    amount: int
    created_at: datetime
    model: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    estimated: bool = False


def current_period(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Mês corrente em UTC: [primeiro dia 00:00, primeiro dia do mês seguinte)."""
    now = now or datetime.now(UTC)
    start = now.astimezone(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    return start, end


async def get_balance(session: AsyncSession, user_id: uuid.UUID, monthly_quota: int) -> Balance:
    """Saldo do mês: cota mensal + recargas do mês - consumo do mês (nunca negativo)."""
    start, end = current_period()
    used = await chat_repo.tokens_used_between(session, user_id, start, end)
    credits = await tokens_ledger.credits_between(session, user_id, start, end)
    limit = monthly_quota + credits
    return Balance(balance=max(limit - used, 0), limit=limit, used=used, credits=credits, period_start=start, period_end=end)


async def recharge(session: AsyncSession, user_id: uuid.UUID, amount: int, *, monthly_quota: int, monthly_credit_cap: int) -> Balance:
    if amount not in RECHARGE_PACKAGES:
        raise ApiError(400, "Pacote de recarga inválido.", {"amount": f"Escolha um destes valores: {', '.join(map(str, RECHARGE_PACKAGES))}."})
    # Trava a linha da conta: duas recargas simultâneas não passam juntas do teto mensal.
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    start, end = current_period()
    if await tokens_ledger.credits_between(session, user_id, start, end) + amount > monthly_credit_cap:
        raise ApiError(429, "Limite de recargas do mês atingido.")
    await tokens_ledger.add_credit(session, user_id, amount)
    return await get_balance(session, user_id, monthly_quota)


async def history(session: AsyncSession, user_id: uuid.UUID, limit: int) -> list[HistoryItem]:
    """Extrato com consumo e recargas, do mais recente para o mais antigo."""
    usage = [
        HistoryItem(
            id=item.id, kind="usage", amount=item.total_tokens, created_at=item.created_at, model=item.model,
            prompt_tokens=item.prompt_tokens, completion_tokens=item.completion_tokens, estimated=item.estimated,
        )
        for item in await tokens_ledger.recent_usage(session, user_id, limit)
    ]
    credits = [
        HistoryItem(id=item.id, kind="recharge", amount=item.amount, created_at=item.created_at)
        for item in await tokens_ledger.recent_credits(session, user_id, limit)
    ]
    return sorted(usage + credits, key=lambda item: item.created_at, reverse=True)[:limit]
