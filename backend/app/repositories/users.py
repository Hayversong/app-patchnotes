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


# Únicas colunas que a atualização de perfil pode gravar. Senha, e-mail e versão de sessão ficam de fora.
PROFILE_COLUMNS = frozenset({"name", "bio", "avatar_url", "github_url"})


async def update_profile_fields(session: AsyncSession, user_id: uuid.UUID, values: dict[str, str]) -> User | None:
    """UPDATE só das colunas de perfil, lendo o estado atual do banco (RETURNING).

    Nunca regrava colunas que não foram enviadas: uma redefinição de senha concorrente não é desfeita.
    """
    unknown = set(values) - PROFILE_COLUMNS
    if unknown:
        raise ValueError(f"colunas não permitidas no perfil: {sorted(unknown)}")
    statement = update(User).where(User.id == user_id).values(**values).returning(User)
    result = await session.execute(statement, execution_options={"populate_existing": True})
    return result.scalar_one_or_none()


async def set_password(session: AsyncSession, user_id: uuid.UUID, password_hash: str, tokens_valid_after: datetime) -> None:
    await session.execute(
        update(User).where(User.id == user_id).values(password_hash=password_hash, tokens_valid_after=tokens_valid_after)
    )
