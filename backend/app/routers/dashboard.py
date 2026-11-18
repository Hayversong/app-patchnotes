from fastapi import APIRouter, Query

from app.routers.deps import CurrentUser, SessionDep, SettingsDep
from app.schemas.dashboard import ActivityHeatmapResponse, DashboardMetrics, EntriesByTagResponse, TokenBalanceResponse, TokenUsageResponse
from app.services import dashboard_service, quota_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/metrics", response_model=DashboardMetrics)
async def metrics(user: CurrentUser, session: SessionDep) -> DashboardMetrics:
    return await dashboard_service.metrics(session, user.id)


@router.get("/activity-heatmap", response_model=ActivityHeatmapResponse)
async def activity_heatmap(user: CurrentUser, session: SessionDep) -> ActivityHeatmapResponse:
    return ActivityHeatmapResponse(days=await dashboard_service.activity_heatmap(session, user.id))


@router.get("/token-usage", response_model=TokenUsageResponse)
async def token_usage(user: CurrentUser, session: SessionDep, period: str = Query(default="7d", max_length=8)) -> TokenUsageResponse:
    return TokenUsageResponse(points=await dashboard_service.token_usage(session, user.id, period))


@router.get("/entries-by-tag", response_model=EntriesByTagResponse)
async def entries_by_tag(user: CurrentUser, session: SessionDep) -> EntriesByTagResponse:
    return EntriesByTagResponse(tags=await dashboard_service.entries_by_tag(session, user.id))


# Parte 2: adição aprovada (saldo da cota mensal).
@router.get("/token-balance", response_model=TokenBalanceResponse)
async def token_balance(user: CurrentUser, session: SessionDep, settings: SettingsDep) -> TokenBalanceResponse:
    balance = await quota_service.get_balance(session, user.id, settings.monthly_token_quota)
    return TokenBalanceResponse(balance=balance.balance, limit=balance.limit, used=balance.used, period_start=balance.period_start, period_end=balance.period_end)
