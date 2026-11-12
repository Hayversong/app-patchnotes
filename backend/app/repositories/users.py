import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def get_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_by_email(session: AsyncSession, email: str) -> User | None:
    return await session.scalar(select(User).where(User.email == email))


async def create(session: AsyncSession, *, name: str, email: str, password_hash: str) -> User:
    user = User(name=name, email=email, password_hash=password_hash)
    session.add(user)
    await session.flush()
    return user


async def update_fields(session: AsyncSession, user: User, values: dict[str, str]) -> User:
    for field, value in values.items():
        setattr(user, field, value)
    await session.flush()
    return user


async def set_password(session: AsyncSession, user_id: uuid.UUID, password_hash: str, tokens_valid_after: datetime) -> None:
    await session.execute(
        update(User).where(User.id == user_id).values(password_hash=password_hash, tokens_valid_after=tokens_valid_after)
    )
