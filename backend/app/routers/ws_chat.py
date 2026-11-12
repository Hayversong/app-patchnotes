"""WebSocket /ws/chat — resposta do LLM token a token.

Protocolo (JSON em frames de texto; detalhes em docs/API_CONTRACTS.md):
  cliente → {"type": "auth", "token": "<access token>"}              (1ª mensagem, em até WS_AUTH_TIMEOUT_SECONDS)
  servidor → {"type": "ready"}
  cliente → {"type": "message", "message": "...", "context": "..."?}
  servidor → {"type": "start"} · {"type": "token", "content": "..."}* · {"type": "done", "done": true, "tokens": n, "message": {...}}
  servidor → {"type": "error", "code": "...", "message": "..."}         (erros recuperáveis; a conexão segue aberta)

O token nunca vai na URL. Códigos de fechamento: 4401 (não autenticado/expirado), 4408 (inatividade),
4429 (conexões simultâneas demais para a conta), 1008 (violação de protocolo), 1009 (frame grande demais),
1011 (erro interno), 1013 (serviço indisponível). Origem não permitida ou IP com conexões demais: recusado no
handshake (HTTP 403), antes de alocar qualquer recurso.

Limites (S3): vagas por IP (toda a vida da conexão, inclusive antes da autenticação) e por conta, compartilhadas
entre réplicas via Redis, com heartbeat; a conexão também fecha por inatividade e quando o access token expira.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.errors import ApiError
from app.core.connection_limits import ConnectionSlots
from app.core.rate_limit import LIMITS_UNAVAILABLE_MESSAGE, RATE_LIMIT_MESSAGE, RateLimiter, client_ip
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
CLOSE_IDLE = 4408
CLOSE_TOO_MANY = 4429
CLOSE_POLICY = 1008
CLOSE_TOO_LARGE = 1009
CLOSE_INTERNAL = 1011
CLOSE_UNAVAILABLE = 1013

Held = list[tuple[str, str]]  # (chave, vaga) ocupadas por esta conexão


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


async def _heartbeat(slots: ConnectionSlots, held: Held, ttl: float) -> None:
    """Renova as vagas desta conexão enquanto ela vive (também durante a geração do LLM)."""
    while True:
        await asyncio.sleep(ttl / 3)
        for key, slot in list(held):
            try:
                await slots.refresh(key, slot, ttl)
            except RedisError as error:
                logger.warning("Não foi possível renovar a vaga do WebSocket: %s", type(error).__name__)


async def _release(slots: ConnectionSlots, held: Held) -> None:
    for key, slot in held:
        try:
            await slots.release(key, slot)
        except Exception as error:  # noqa: BLE001 — a vaga expira sozinha pelo TTL
            logger.warning("Não foi possível liberar a vaga do WebSocket: %s", type(error).__name__)
    held.clear()


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket) -> None:
    settings: Settings = websocket.app.state.settings
    origin = websocket.headers.get("origin")
    # Navegadores sempre enviam Origin; recusar origens desconhecidas impede o uso por sites de terceiros.
    if origin is not None and origin.rstrip("/") not in settings.cors_origins:
        await websocket.close(CLOSE_FORBIDDEN_ORIGIN)
        return

    slots: ConnectionSlots = websocket.app.state.connection_slots
    ttl = settings.ws_slot_ttl_seconds
    held: Held = []
    ip_key = f"ip:{client_ip(websocket)}"
    try:
        ip_slot = await slots.acquire(ip_key, settings.ws_max_connections_per_ip, ttl)
    except RedisError as error:
        logger.error("Vagas de WebSocket indisponíveis: %s", type(error).__name__)
        await websocket.close(CLOSE_UNAVAILABLE)
        return
    if ip_slot is None:
        await websocket.close(CLOSE_TOO_MANY)  # antes do accept: o handshake é recusado
        return
    held.append((ip_key, ip_slot))
    heartbeat = asyncio.create_task(_heartbeat(slots, held, ttl))
    try:
        await websocket.accept()
        await _serve(websocket, settings, slots, held)
    except (_Closed, WebSocketDisconnect):
        pass
    except RedisError as error:
        logger.error("Vagas de WebSocket indisponíveis: %s", type(error).__name__)
        await _close_quietly(websocket, CLOSE_UNAVAILABLE)
    except Exception as error:  # noqa: BLE001 — uma conexão com problema não pode derrubar o servidor
        logger.error("Erro inesperado no WebSocket: %s", type(error).__name__, exc_info=error)
        await _close_quietly(websocket, CLOSE_INTERNAL)
    finally:
        heartbeat.cancel()
        await _release(slots, held)


async def _close_quietly(websocket: WebSocket, code: int) -> None:
    try:
        await websocket.close(code)
    except Exception:  # noqa: BLE001 — a conexão pode já estar fechada
        pass


def _seconds_until(moment: datetime) -> float:
    return (moment - datetime.now(UTC)).total_seconds()


async def _serve(websocket: WebSocket, settings: Settings, slots: ConnectionSlots, held: Held) -> None:
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
    user, expires_at = authenticated

    user_key = f"user:{user.id}"
    user_slot = await slots.acquire(user_key, settings.ws_max_connections_per_user, settings.ws_slot_ttl_seconds)
    if user_slot is None:
        await _send_error(websocket, "too_many_connections", "Há conexões demais abertas para esta conta. Feche outras abas do chat.")
        await websocket.close(CLOSE_TOO_MANY)
        return
    held.append((user_key, user_slot))
    await websocket.send_json({"type": "ready"})

    chat: ChatService = websocket.app.state.chat_service
    limiter: RateLimiter = websocket.app.state.rate_limiter

    while True:
        # Espera a próxima mensagem até a inatividade OU a expiração do access token, o que vier antes.
        token_left = _seconds_until(expires_at)
        try:
            text = await asyncio.wait_for(_receive_text(websocket, max_bytes), timeout=max(0.0, min(settings.ws_idle_timeout_seconds, token_left)))
        except TimeoutError:
            if _seconds_until(expires_at) <= 0:
                await _send_error(websocket, "unauthorized", "Sessão expirada. Entre novamente.")
                await websocket.close(CLOSE_UNAUTHORIZED)
            else:
                await websocket.close(CLOSE_IDLE, "Conexão encerrada por inatividade.")
            return
        data = _parse(text)
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
        if settings.rate_limit_enabled:
            try:
                allowed = await limiter.allow(f"chat:{user.id}", CHAT_RATE_LIMIT, 60)
            except RedisError:
                await _send_error(websocket, "unavailable", LIMITS_UNAVAILABLE_MESSAGE)
                continue
            if not allowed:
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
