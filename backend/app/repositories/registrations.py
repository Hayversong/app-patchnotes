"""Cadastros pendentes de confirmação."""

from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PendingRegistration


async def upsert(session: AsyncSession, *, email: str, name: str, password_hash: str, token_hash: str, expires_at: datetime) -> None:
    """Um pedido por e-mail: um novo substitui o anterior (o link antigo deixa de valer)."""
    values = {"email": email, "name": name, "password_hash": password_hash, "token_hash": token_hash, "expires_at": expires_at}
    statement = insert(PendingRegistration).values(**values)
    await session.execute(statement.on_conflict_do_update(index_elements=["email"], set_=values))


async def consume(session: AsyncSession, token_hash: str, now: datetime) -> PendingRegistration | None:
    """Apaga e devolve o pedido, se o token existe e não venceu. Uso único: o DELETE é atômico."""
    result = await session.execute(
        delete(PendingRegistration)
        .where(PendingRegistration.token_hash == token_hash, PendingRegistration.expires_at > now)
        .returning(PendingRegistration)
    )
    return result.scalar_one_or_none()


async def discard(session: AsyncSession, email: str) -> None:
    await session.execute(delete(PendingRegistration).where(PendingRegistration.email == email))
