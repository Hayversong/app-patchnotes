"""Refresh tokens e tokens de redefinição de senha. Só hashes SHA-256 são gravados."""

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PasswordResetToken, RefreshToken


async def add_refresh_token(session: AsyncSession, *, user_id: uuid.UUID, family_id: uuid.UUID, token_hash: str, expires_at: datetime) -> RefreshToken:
    token = RefreshToken(user_id=user_id, family_id=family_id, token_hash=token_hash, expires_at=expires_at)
    session.add(token)
    await session.flush()
    return token


async def find_refresh_token(session: AsyncSession, token_hash: str) -> RefreshToken | None:
    return await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))


async def claim_refresh_token(session: AsyncSession, token_id: uuid.UUID, now: datetime) -> bool:
    """Revoga atomicamente um token ainda ativo. Duas rotações simultâneas do mesmo token: só uma vence."""
    result = await session.execute(
        update(RefreshToken)
        .where(RefreshToken.id == token_id, RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > now)
        .values(revoked_at=now)
        .returning(RefreshToken.id)
    )
    return result.scalar_one_or_none() is not None


async def link_replacement(session: AsyncSession, token_id: uuid.UUID, replaced_by_id: uuid.UUID) -> None:
    await session.execute(update(RefreshToken).where(RefreshToken.id == token_id).values(replaced_by_id=replaced_by_id))


async def revoke_family(session: AsyncSession, family_id: uuid.UUID, now: datetime) -> None:
    await session.execute(
        update(RefreshToken).where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now)
    )


async def revoke_all_for_user(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    await session.execute(
        update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now)
    )


async def add_reset_token(session: AsyncSession, *, user_id: uuid.UUID, token_hash: str, expires_at: datetime) -> None:
    session.add(PasswordResetToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at))
    await session.flush()


async def invalidate_reset_tokens(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    await session.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )


async def consume_reset_token(session: AsyncSession, token_hash: str, now: datetime) -> uuid.UUID | None:
    """Marca o token como usado se ainda for válido e retorna o usuário. Uso único garantido pelo UPDATE condicional."""
    result = await session.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.token_hash == token_hash, PasswordResetToken.used_at.is_(None), PasswordResetToken.expires_at > now)
        .values(used_at=now)
        .returning(PasswordResetToken.user_id)
    )
    return result.scalar_one_or_none()
