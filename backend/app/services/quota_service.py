import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import chat as chat_repo


@dataclass(frozen=True)
class Balance:
    balance: int
    limit: int
    used: int
    period_start: datetime
    period_end: datetime


def current_period(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Mês corrente em UTC: [primeiro dia 00:00, primeiro dia do mês seguinte)."""
    now = now or datetime.now(UTC)
    start = now.astimezone(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    return start, end


async def get_balance(session: AsyncSession, user_id: uuid.UUID, monthly_quota: int) -> Balance:
    start, end = current_period()
    used = await chat_repo.tokens_used_between(session, user_id, start, end)
    return Balance(balance=max(monthly_quota - used, 0), limit=monthly_quota, used=used, period_start=start, period_end=end)
