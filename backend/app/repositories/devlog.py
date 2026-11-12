import uuid
from datetime import datetime

from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DevlogEntry


async def list_for_user(
    session: AsyncSession, user_id: uuid.UUID, *, limit: int, before: tuple[datetime, uuid.UUID] | None = None
) -> list[DevlogEntry]:
    """Mais recentes primeiro, por keyset (created_at, id): estável mesmo com entradas novas entre as páginas.
    `before` é a última entrada da página anterior."""
    query = select(DevlogEntry).where(DevlogEntry.user_id == user_id)
    if before is not None:
        query = query.where(tuple_(DevlogEntry.created_at, DevlogEntry.id) < tuple_(*before))
    result = await session.scalars(query.order_by(DevlogEntry.created_at.desc(), DevlogEntry.id.desc()).limit(limit))
    return list(result)


async def create(session: AsyncSession, *, user_id: uuid.UUID, title: str, content: str, tags: list[str]) -> DevlogEntry:
    entry = DevlogEntry(user_id=user_id, title=title, content=content, tags=tags)
    session.add(entry)
    await session.flush()
    return entry


async def count_for_user(session: AsyncSession, user_id: uuid.UUID) -> int:
    return await session.scalar(select(func.count()).select_from(DevlogEntry).where(DevlogEntry.user_id == user_id)) or 0
