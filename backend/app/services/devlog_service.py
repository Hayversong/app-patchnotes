import base64
import binascii
import json
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import DevlogEntry
from app.repositories import devlog as devlog_repo
from app.schemas.devlog import CreateDevlogRequest

INVALID_CURSOR_MESSAGE = "Página inválida. Recarregue a lista e tente novamente."


def encode_cursor(entry: DevlogEntry) -> str:
    """Cursor opaco da próxima página: posição (created_at, id) da última entrada devolvida.
    Não precisa ser secreto: a consulta é sempre filtrada pelo usuário autenticado."""
    raw = json.dumps({"t": entry.created_at.isoformat(), "i": str(entry.id)}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        created_at = datetime.fromisoformat(data["t"])
        if created_at.tzinfo is None:
            raise ValueError("sem fuso")
        return created_at, uuid.UUID(data["i"])
    except (binascii.Error, UnicodeDecodeError, ValueError, KeyError, TypeError) as error:
        raise ApiError(400, INVALID_CURSOR_MESSAGE, {"formErrors": [], "fieldErrors": {"cursor": ["Cursor inválido"]}}) from error


async def list_entries(session: AsyncSession, user_id: uuid.UUID, *, limit: int, cursor: str | None = None) -> tuple[list[DevlogEntry], str | None]:
    """Uma página de entradas e o cursor da próxima (None na última)."""
    before = decode_cursor(cursor) if cursor else None
    rows = await devlog_repo.list_for_user(session, user_id, limit=limit + 1, before=before)
    page = rows[:limit]
    return page, encode_cursor(page[-1]) if len(rows) > limit else None


async def create_entry(session: AsyncSession, user_id: uuid.UUID, data: CreateDevlogRequest) -> DevlogEntry:
    tags = list(dict.fromkeys(tag.strip() for tag in (data.tags or []) if tag.strip()))
    return await devlog_repo.create(session, user_id=user_id, title=data.title, content=data.content, tags=tags)
