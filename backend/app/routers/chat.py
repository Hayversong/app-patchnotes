import logging

from fastapi import APIRouter, Request

from app.core.errors import ApiError
from app.core.rate_limit import enforce
from app.routers.deps import ChatServiceDep, CurrentUser
from app.schemas.chat import ChatHistoryResponse, ChatMessageOut, SendChatRequest, SendChatResponse
from app.services.llm_service import LLMError, LLMTimeoutError

logger = logging.getLogger("patchnotes.chat")
router = APIRouter(prefix="/chat", tags=["chat"])

CHAT_RATE_LIMIT = 20  # mensagens por minuto por usuário (REST + WebSocket somados)


@router.get("/history", response_model=ChatHistoryResponse, response_model_exclude_none=True)
async def history(user: CurrentUser, chat: ChatServiceDep) -> ChatHistoryResponse:
    messages = await chat.history(user.id)
    return ChatHistoryResponse(messages=[ChatMessageOut.model_validate(message, from_attributes=True) for message in messages])


@router.post("/send", response_model=SendChatResponse)
async def send(body: SendChatRequest, request: Request, user: CurrentUser, chat: ChatServiceDep) -> SendChatResponse:
    """Mesmo contrato da Parte 1: devolve a resposta completa. A rota não mantém sessão de banco durante a geração."""
    await enforce(request, "chat", str(user.id), limit=CHAT_RATE_LIMIT, window_seconds=60)
    try:
        answer = await chat.reply(user.id, body.message, body.context)
    except LLMError as error:
        logger.warning("Falha do LLM no chat REST: %s", error.code)
        raise ApiError(504 if isinstance(error, LLMTimeoutError) else 503, error.user_message) from error
    return SendChatResponse.model_validate(answer, from_attributes=True)
