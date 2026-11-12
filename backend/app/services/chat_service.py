"""Chat com o LLM, compartilhado pelo REST (POST /api/chat/send) e pelo WebSocket (/ws/chat).

Fluxo por mensagem — nenhuma sessão/transação de banco fica aberta enquanto o LLM gera:
1. transação curta: confere a cota, grava o pedido (status `pending`) e lê o contexto recente;
2. streaming do LLM, sem banco;
3. transação curta: grava a resposta, conclui o pedido e registra o consumo de tokens.
Em qualquer falha (LLM, desconexão, cancelamento) o pedido vira `failed` e não aparece no histórico.
"""

import asyncio
import contextlib
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.errors import ApiError
from app.models import ChatMessage
from app.repositories import chat as chat_repo
from app.services import quota_service
from app.services.llm_service import LLMError, LLMMessage, LLMService, StreamEnd, TokenChunk, estimate_tokens

logger = logging.getLogger("patchnotes.chat")

QUOTA_EXCEEDED_MESSAGE = "Você atingiu a cota mensal de tokens. O saldo é renovado no início do próximo mês."

OnToken = Callable[[str], Awaitable[None]]


class QuotaExceededError(ApiError):
    def __init__(self) -> None:
        super().__init__(429, QUOTA_EXCEEDED_MESSAGE)


@dataclass(frozen=True)
class _Prepared:
    request_id: uuid.UUID
    prompt: list[LLMMessage]


class ChatService:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], llm: LLMService, settings: Settings) -> None:
        self._sessionmaker = sessionmaker
        self._llm = llm
        self._settings = settings

    async def history(self, user_id: uuid.UUID) -> list[ChatMessage]:
        async with self._sessionmaker() as session:
            return await chat_repo.recent_complete(session, user_id, self._settings.chat_history_max)

    async def reply(self, user_id: uuid.UUID, message: str, context: str | None = None, on_token: OnToken | None = None) -> ChatMessage:
        prepared = await self._prepare(user_id, message, context)
        try:
            content, end = await self._generate(prepared.prompt, on_token)
        except BaseException:
            # Inclui desconexão do WebSocket (exceção vinda de on_token) e cancelamento da tarefa.
            await asyncio.shield(self._mark_failed(prepared.request_id))
            raise
        return await self._finish(user_id, prepared, content, end)

    async def _prepare(self, user_id: uuid.UUID, message: str, context: str | None) -> _Prepared:
        async with self._sessionmaker() as session, session.begin():
            start, end = quota_service.current_period()
            if await chat_repo.tokens_used_between(session, user_id, start, end) >= self._settings.monthly_token_quota:
                raise QuotaExceededError
            recent = await chat_repo.recent_complete(session, user_id, self._settings.chat_context_messages)
            request = await chat_repo.add_message(session, user_id=user_id, role="user", content=message, status="pending")
        system = self._settings.chat_system_prompt
        if context:
            system = f"{system}\n\nContexto fornecido pela pessoa usuária:\n{context}"
        prompt = [LLMMessage("system", system), *(LLMMessage(item.role, item.content) for item in recent), LLMMessage("user", message)]
        return _Prepared(request.id, prompt)

    async def _generate(self, prompt: list[LLMMessage], on_token: OnToken | None) -> tuple[str, StreamEnd]:
        parts: list[str] = []
        end: StreamEnd | None = None
        # aclosing fecha a conexão HTTP com o Ollama na hora (e interrompe a geração) se o consumidor falhar.
        async with contextlib.aclosing(self._llm.stream(prompt)) as stream:
            async for event in stream:
                if isinstance(event, TokenChunk):
                    parts.append(event.content)
                    if on_token is not None:
                        await on_token(event.content)
                elif isinstance(event, StreamEnd):
                    end = event
        content = "".join(parts).strip()
        if end is None or not content:
            raise LLMError("o modelo terminou sem gerar resposta")
        return content, end

    async def _finish(self, user_id: uuid.UUID, prepared: _Prepared, content: str, end: StreamEnd) -> ChatMessage:
        prompt_tokens = end.prompt_tokens if end.prompt_tokens is not None else estimate_tokens("\n".join(m.content for m in prepared.prompt))
        completion_tokens = end.completion_tokens if end.completion_tokens is not None else estimate_tokens(content)
        estimated = end.prompt_tokens is None or end.completion_tokens is None
        async with self._sessionmaker() as session, session.begin():
            await chat_repo.complete_message(session, prepared.request_id, prompt_tokens)
            answer = await chat_repo.add_message(
                session, user_id=user_id, role="assistant", content=content, status="complete",
                tokens_used=completion_tokens, created_at=datetime.now(UTC),
            )
            await chat_repo.add_usage(
                session, user_id=user_id, message_id=answer.id, model=self._llm.model,
                prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, estimated=estimated,
            )
        return answer

    async def _mark_failed(self, request_id: uuid.UUID) -> None:
        try:
            async with self._sessionmaker() as session, session.begin():
                await chat_repo.fail_message(session, request_id)
        except Exception as error:  # noqa: BLE001 — limpeza não pode mascarar o erro original
            logger.error("Não foi possível marcar a mensagem como falha: %s", type(error).__name__)
