import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import chat as chat_repo
from app.repositories import devlog as devlog_repo
from app.repositories import metrics as metrics_repo
from app.schemas.dashboard import ActivityDay, DashboardMetrics, EntriesByTag, TokenUsagePoint

HEATMAP_DAYS = 90
PERIOD_DAYS = {"7d": 7, "30d": 30}


def _today() -> date:
    return datetime.now(UTC).date()


def format_active_time(seconds: int) -> str:
    minutes = seconds // 60
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes}min" if hours else f"{minutes}min"


def compute_streak(days: set[date], today: date) -> int:
    """Dias consecutivos com atividade, terminando hoje (ou ontem, se ainda não houve atividade hoje)."""
    cursor = today if today in days else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


async def metrics(session: AsyncSession, user_id: uuid.UUID) -> DashboardMetrics:
    today = _today()
    return DashboardMetrics(
        total_entries=await devlog_repo.count_for_user(session, user_id),
        tokens_used=await chat_repo.tokens_used_between(session, user_id),
        active_time=format_active_time(await metrics_repo.active_seconds(session, user_id)),
        messages_exchanged=await chat_repo.count_complete(session, user_id),
        streak=compute_streak(await metrics_repo.activity_dates(session, user_id, today - timedelta(days=366)), today),
    )


async def activity_heatmap(session: AsyncSession, user_id: uuid.UUID) -> list[ActivityDay]:
    start = _today() - timedelta(days=HEATMAP_DAYS - 1)
    counts = await metrics_repo.devlog_counts_by_day(session, user_id, start)
    return [ActivityDay(date=(day := start + timedelta(days=offset)).isoformat(), count=counts.get(day, 0)) for offset in range(HEATMAP_DAYS)]


async def token_usage(session: AsyncSession, user_id: uuid.UUID, period: str) -> list[TokenUsagePoint]:
    length = PERIOD_DAYS.get(period, 7)  # contrato: valor desconhecido é tratado como 7d
    start = _today() - timedelta(days=length - 1)
    totals = await metrics_repo.tokens_by_day(session, user_id, start)
    return [TokenUsagePoint(date=(day := start + timedelta(days=offset)).isoformat(), tokens=totals.get(day, 0)) for offset in range(length)]


async def entries_by_tag(session: AsyncSession, user_id: uuid.UUID) -> list[EntriesByTag]:
    return [EntriesByTag(tag=tag, count=count) for tag, count in await metrics_repo.entries_by_tag(session, user_id)]
