import uuid
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel, UtcDateTime

MAX_MESSAGE_LENGTH = 2000


class ChatMessageOut(ApiModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: UtcDateTime
    tokens_used: int | None = None


class ChatHistoryResponse(ApiModel):
    messages: list[ChatMessageOut]


class SendChatRequest(ApiModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    context: str | None = Field(default=None, max_length=4000)


class SendChatResponse(ChatMessageOut):
    role: Literal["assistant"]
    tokens_used: int
