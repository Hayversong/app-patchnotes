from dataclasses import asdict

from fastapi import APIRouter, Query, Request

from app.core.rate_limit import enforce
from app.routers.deps import CurrentUser, SessionDep, SettingsDep
from app.schemas.dashboard import TokenBalanceResponse
from app.schemas.tokens import RechargeRequest, RechargeResponse, TokenHistoryItem, TokenHistoryResponse
from app.services import quota_service

router = APIRouter(prefix="/tokens", tags=["tokens"])

RECHARGES_PER_MINUTE = 10


def _balance_fields(balance: quota_service.Balance) -> dict[str, object]:
    return asdict(balance)


@router.get("/balance", response_model=TokenBalanceResponse, summary="Saldo de tokens do mês")
async def balance(user: CurrentUser, session: SessionDep, settings: SettingsDep) -> TokenBalanceResponse:
    result = await quota_service.get_balance(session, user.id, settings.monthly_token_quota)
    return TokenBalanceResponse(**_balance_fields(result))


@router.get("/history", response_model=TokenHistoryResponse, response_model_exclude_none=True, summary="Extrato de consumo e recargas")
async def history(
    user: CurrentUser, session: SessionDep, limit: int = Query(default=20, ge=1, le=quota_service.HISTORY_MAX),
) -> TokenHistoryResponse:
    items = await quota_service.history(session, user.id, limit)
    return TokenHistoryResponse(
        items=[TokenHistoryItem(**asdict(item)) for item in items], packages=list(quota_service.RECHARGE_PACKAGES),
    )


@router.post("/recharge", response_model=RechargeResponse, summary="Recarga simulada de tokens (sem cobrança)")
async def recharge(body: RechargeRequest, request: Request, user: CurrentUser, session: SessionDep, settings: SettingsDep) -> RechargeResponse:
    await enforce(request, "token-recharge", str(user.id), limit=RECHARGES_PER_MINUTE, window_seconds=60)
    result = await quota_service.recharge(
        session, user.id, body.amount,
        monthly_quota=settings.monthly_token_quota, monthly_credit_cap=settings.monthly_token_credit_cap,
    )
    return RechargeResponse(**_balance_fields(result), recharged=body.amount)
