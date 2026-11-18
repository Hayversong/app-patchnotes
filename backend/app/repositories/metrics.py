"""Consultas agregadas do dashboard (SQL parametrizado; datas agrupadas em UTC)."""

import uuid
from datetime import date

from sqlalchemy import Date, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, DevlogEntry, TokenUsage

# Sessões de uso: eventos (devlogs e mensagens enviadas) com até 30 min de intervalo formam uma sessão;
# cada sessão vale (último - primeiro evento) + 5 min.
_ACTIVE_SECONDS_SQL = text("""
WITH events AS (
    SELECT created_at AS ts FROM devlog_entries WHERE user_id = :user_id
    UNION ALL
    SELECT created_at FROM chat_messages WHERE user_id = :user_id AND role = 'user' AND status = 'complete'
), flagged AS (
    SELECT ts, CASE WHEN ts - lag(ts) OVER (ORDER BY ts) <= interval '30 minutes' THEN 0 ELSE 1 END AS starts_session
    FROM events
), grouped AS (
    SELECT ts, sum(starts_session) OVER (ORDER BY ts) AS session_id FROM flagged
)
SELECT coalesce(sum(extract(epoch FROM (last_ts - first_ts)) + 300), 0)
FROM (SELECT min(ts) AS first_ts, max(ts) AS last_ts FROM grouped GROUP BY session_id) AS sessions
""")


def _utc_date(column):  # type: ignore[no-untyped-def]
    return cast(func.timezone("UTC", column), Date)


async def active_seconds(session: AsyncSession, user_id: uuid.UUID) -> int:
    return int(await session.scalar(_ACTIVE_SECONDS_SQL, {"user_id": user_id}) or 0)


async def activity_dates(session: AsyncSession, user_id: uuid.UUID, since: date) -> set[date]:
    devlog_day = _utc_date(DevlogEntry.created_at)
    chat_day = _utc_date(ChatMessage.created_at)
    devlog = select(devlog_day.label("day")).where(DevlogEntry.user_id == user_id, devlog_day >= since)
    chat = select(chat_day.label("day")).where(ChatMessage.user_id == user_id, ChatMessage.role == "user", ChatMessage.status == "complete", chat_day >= since)
    days = devlog.union(chat).subquery()
    result = await session.scalars(select(days.c.day))
    return set(result)


async def devlog_counts_by_day(session: AsyncSession, user_id: uuid.UUID, since: date) -> dict[date, int]:
    day = _utc_date(DevlogEntry.created_at)
    rows = await session.execute(select(day, func.count()).where(DevlogEntry.user_id == user_id, day >= since).group_by(day))
    return {row[0]: int(row[1]) for row in rows}


async def tokens_by_day(session: AsyncSession, user_id: uuid.UUID, since: date) -> dict[date, int]:
    day = _utc_date(TokenUsage.created_at)
    rows = await session.execute(select(day, func.sum(TokenUsage.total_tokens)).where(TokenUsage.user_id == user_id, day >= since).group_by(day))
    return {row[0]: int(row[1]) for row in rows}


async def entries_by_tag(session: AsyncSession, user_id: uuid.UUID) -> list[tuple[str, int]]:
    tag = func.unnest(DevlogEntry.tags).table_valued("tag").render_derived()
    rows = await session.execute(
        select(tag.c.tag, func.count())
        .select_from(DevlogEntry)
        .join(tag, text("true"))
        .where(DevlogEntry.user_id == user_id)
        .group_by(tag.c.tag)
        .order_by(func.count().desc(), tag.c.tag)
    )
    return [(str(row[0]), int(row[1])) for row in rows]


