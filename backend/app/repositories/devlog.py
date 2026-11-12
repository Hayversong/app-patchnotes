import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DevlogEntry


async def list_for_user(session: AsyncSession, user_id: uuid.UUID) -> list[DevlogEntry]:
    result = await session.scalars(
        select(DevlogEntry).where(DevlogEntry.user_id == user_id).order_by(DevlogEntry.created_at.desc(), DevlogEntry.id.desc())
    )
    return list(result)


async def create(session: AsyncSession, *, user_id: uuid.UUID, title: str, content: str, tags: list[str]) -> DevlogEntry:
    entry = DevlogEntry(user_id=user_id, title=title, content=content, tags=tags)
    session.add(entry)
    await session.flush()
    return entry


async def count_for_user(session: AsyncSession, user_id: uuid.UUID) -> int:
    return await session.scalar(select(func.count()).select_from(DevlogEntry).where(DevlogEntry.user_id == user_id)) or 0
