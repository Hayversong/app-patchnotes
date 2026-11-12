import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DevlogEntry
from app.repositories import devlog as devlog_repo
from app.schemas.devlog import CreateDevlogRequest


async def list_entries(session: AsyncSession, user_id: uuid.UUID) -> list[DevlogEntry]:
    return await devlog_repo.list_for_user(session, user_id)


async def create_entry(session: AsyncSession, user_id: uuid.UUID, data: CreateDevlogRequest) -> DevlogEntry:
    tags = list(dict.fromkeys(tag.strip() for tag in (data.tags or []) if tag.strip()))
    return await devlog_repo.create(session, user_id=user_id, title=data.title, content=data.content, tags=tags)
