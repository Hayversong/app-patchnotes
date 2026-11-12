"""WebSocket /ws/chat — resposta do LLM token a token.

Protocolo (JSON em frames de texto; detalhes em docs/API_CONTRACTS.md):
  cliente → {"type": "auth", "token": "<access token>"}              (1ª mensagem, em até WS_AUTH_TIMEOUT_SECONDS)
  servidor → {"type": "ready"}
  cliente → {"type": "message", "message": "...", "context": "..."?}
  servidor → {"type": "start"} · {"type": "token", "content": "..."}* · {"type": "done", "done": true, "tokens": n, "message": {...}}
  servidor → {"type": "error", "code": "...", "message": "..."}         (erros recuperáveis; a conexão segue aberta)

O token nunca vai na URL. Códigos de fechamento: 4401 (não autenticado/expirado), 4403 (origem não permitida),
1008 (violação de protocolo), 1009 (frame grande demais).
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.errors import ApiError
from app.core.rate_limit import RATE_LIMIT_MESSAGE, RateLimiter
from app.models import User
from app.routers.chat import CHAT_RATE_LIMIT
from app.schemas.chat import ChatMessageOut, SendChatRequest
from app.services import auth_service
from app.services.chat_service import ChatService
from app.services.llm_service import LLMError

logger = logging.getLogger("patchnotes.ws")
router = APIRouter()

CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN_ORIGIN = 4403
CLOSE_POLICY = 1008
CLOSE_TOO_LARGE = 1009


class _Closed(Exception):
    """A conexão já foi encerrada (pelo cliente ou por nós)."""


async def _receive_text(websocket: WebSocket, max_bytes: int) -> str:
    message = await websocket.receive()
    if message["type"] == "websocket.disconnect":
        raise _Closed
    text = message.get("text")
    if text is None:
        await websocket.close(CLOSE_POLICY, "Envie mensagens de texto em JSON.")
        raise _Closed
    if len(text.encode("utf-8")) > max_bytes:
        await websocket.close(CLOSE_TOO_LARGE, "Mensagem grande demais.")
        raise _Closed
    return text


def _parse(text: str) -> dict[str, Any] | None:
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


async def _send_error(websocket: WebSocket, code: str, message: str) -> None:
    await websocket.send_json({"type": "error", "code": code, "message": message})


async def _authenticate(websocket: WebSocket, settings: Settings, token: str) -> tuple[User, datetime] | None:
    sessionmaker: async_sessionmaker[AsyncSession] = websocket.app.state.sessionmaker
    try:
        async with sessionmaker() as session:
            return await auth_service.authenticate_access_token(session, settings, token)
    except ApiError:
        return None


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket) -> None:
    settings: Settings = websocket.app.state.settings
    origin = websocket.headers.get("origin")
    # Navegadores sempre enviam Origin; recusar origens desconhecidas impede o uso por sites de terceiros.
    if origin is not None and origin.rstrip("/") not in settings.cors_origins:
        await websocket.close(CLOSE_FORBIDDEN_ORIGIN)
        return
    await websocket.accept()
    try:
        await _serve(websocket, settings)
    except (_Closed, WebSocketDisconnect):
        pass
    except Exception as error:  # noqa: BLE001 — uma conexão com problema não pode derrubar o servidor
        logger.error("Erro inesperado no WebSocket: %s", type(error).__name__, exc_info=error)
        try:
            await websocket.close(1011)
        except Exception:  # noqa: BLE001
            pass


async def _serve(websocket: WebSocket, settings: Settings) -> None:
    max_bytes = settings.ws_max_frame_bytes
    try:
        first = await asyncio.wait_for(_receive_text(websocket, max_bytes), timeout=settings.ws_auth_timeout_seconds)
    except TimeoutError:
        await websocket.close(CLOSE_UNAUTHORIZED, "Autenticação não recebida a tempo.")
        return
    auth = _parse(first)
    token = auth.get("token") if auth and auth.get("type") == "auth" else None
    authenticated = await _authenticate(websocket, settings, token) if isinstance(token, str) and token else None
    if authenticated is None:
        await websocket.close(CLOSE_UNAUTHORIZED, "Sessão inválida ou expirada.")
        return
    user, _ = authenticated
    await websocket.send_json({"type": "ready"})

    chat: ChatService = websocket.app.state.chat_service
    limiter: RateLimiter = websocket.app.state.rate_limiter

    while True:
        data = _parse(await _receive_text(websocket, max_bytes))
        if data is None or data.get("type") != "message":
            await _send_error(websocket, "invalid_message", 'Formato inválido. Envie {"type": "message", "message": "..."}.')
            continue
        try:
            request = SendChatRequest.model_validate({"message": data.get("message"), "context": data.get("context")})
        except ValidationError:
            await _send_error(websocket, "invalid_message", "A mensagem deve ter entre 1 e 2.000 caracteres.")
            continue

        # Revalida a cada mensagem: token expirado, senha redefinida ou conta removida encerram a conexão.
        if await _authenticate(websocket, settings, token) is None:
            await _send_error(websocket, "unauthorized", "Sessão inválida ou expirada. Entre novamente.")
            await websocket.close(CLOSE_UNAUTHORIZED)
            return
        if settings.rate_limit_enabled and not await limiter.allow(f"chat:{user.id}", CHAT_RATE_LIMIT, 60):
            await _send_error(websocket, "rate_limited", RATE_LIMIT_MESSAGE)
            continue

        await websocket.send_json({"type": "start"})

        async def forward(content: str) -> None:
            await websocket.send_json({"type": "token", "content": content})

        try:
            answer = await chat.reply(user.id, request.message, request.context, on_token=forward)
        except ApiError as error:  # ex.: cota esgotada (429)
            await _send_error(websocket, "quota_exceeded" if error.status_code == 429 else "request_failed", error.message)
            continue
        except LLMError as error:
            logger.warning("Falha do LLM no WebSocket: %s", error.code)
            await _send_error(websocket, error.code, error.user_message)
            continue

        payload = ChatMessageOut.model_validate(answer, from_attributes=True).model_dump(mode="json", exclude_none=True)
        await websocket.send_json({"type": "done", "done": True, "tokens": answer.tokens_used, "message": payload})

