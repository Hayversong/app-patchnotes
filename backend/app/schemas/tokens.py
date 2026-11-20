import uuid
from typing import Literal

from app.schemas.common import ApiModel, UtcDateTime
from app.schemas.dashboard import TokenBalanceResponse


class RechargeRequest(ApiModel):
    amount: int


class RechargeResponse(TokenBalanceResponse):
    recharged: int


class TokenHistoryItem(ApiModel):
    id: uuid.UUID
    kind: Literal["usage", "recharge"]
    amount: int
    created_at: UtcDateTime
    model: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    estimated: bool = False


class TokenHistoryResponse(ApiModel):
    items: list[TokenHistoryItem]
    packages: list[int]
