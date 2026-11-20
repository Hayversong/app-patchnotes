"""Foto de perfil enviada como arquivo e servida pela própria API.

Antes o avatar era uma URL livre: o navegador buscava a imagem num servidor qualquer, que ficava sabendo o IP
de quem via a página, e a CSP precisava liberar imagens de qualquer site. Agora o arquivo fica no banco e a
CSP do frontend aceita só imagens do próprio endereço.

O tipo é decidido pela assinatura dos bytes (nunca pelo Content-Type do cliente) e só PNG, JPEG e WebP passam:
SVG e HTML disfarçados de imagem são recusados. A imagem não é decodificada no servidor.
"""

import secrets
import uuid

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, unauthorized
from app.models import User, UserAvatar
from app.repositories import users as user_repo

AVATAR_PATH = "/api/profile/avatar"
INVALID_IMAGE = "Envie uma imagem PNG, JPEG ou WebP."


def detect_image_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def save_avatar(session: AsyncSession, user_id: uuid.UUID, data: bytes, max_bytes: int) -> User:
    if not data:
        raise ApiError(400, INVALID_IMAGE)
    if len(data) > max_bytes:
        raise ApiError(413, f"A imagem pode ter no máximo {max_bytes // 1024} KB.")
    content_type = detect_image_type(data)
    if content_type is None:
        raise ApiError(400, INVALID_IMAGE)
    values = {"user_id": user_id, "content_type": content_type, "data": data}
    statement = insert(UserAvatar).values(**values)
    await session.execute(statement.on_conflict_do_update(index_elements=["user_id"], set_={"content_type": content_type, "data": data}))
    # Versão nova na URL: o navegador pode guardar a imagem em cache e mesmo assim mostra a troca na hora.
    user = await user_repo.update_profile_fields(session, user_id, {"avatar_url": f"{AVATAR_PATH}?v={secrets.token_hex(6)}"})
    if user is None:
        raise unauthorized()
    return user


async def delete_avatar(session: AsyncSession, user_id: uuid.UUID) -> User:
    await session.execute(delete(UserAvatar).where(UserAvatar.user_id == user_id))
    user = await user_repo.update_profile_fields(session, user_id, {"avatar_url": None})
    if user is None:
        raise unauthorized()
    return user


async def get_avatar(session: AsyncSession, user_id: uuid.UUID) -> UserAvatar | None:
    return await session.get(UserAvatar, user_id)
