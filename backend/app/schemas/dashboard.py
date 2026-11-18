from app.schemas.common import ApiModel, UtcDateTime


class DashboardMetrics(ApiModel):
    total_entries: int
    tokens_used: int
    active_time: str
    messages_exchanged: int
    streak: int


class ActivityDay(ApiModel):
    date: str
    count: int


class ActivityHeatmapResponse(ApiModel):
    days: list[ActivityDay]


class TokenUsagePoint(ApiModel):
    date: str
    tokens: int


class TokenUsageResponse(ApiModel):
    points: list[TokenUsagePoint]


class EntriesByTag(ApiModel):
    tag: str
    count: int


class EntriesByTagResponse(ApiModel):
    tags: list[EntriesByTag]


class TokenBalanceResponse(ApiModel):
    balance: int
    limit: int
    used: int
    period_start: UtcDateTime
    period_end: UtcDateTime
