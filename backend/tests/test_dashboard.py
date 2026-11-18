from datetime import UTC, date, datetime, timedelta

from app.services.dashboard_service import compute_streak, format_active_time
from app.services.quota_service import current_period
from tests.conftest import Harness


def get(harness: Harness, token: str, path: str) -> dict:
    response = harness.client.get(f"/api/dashboard/{path}", headers=harness.auth(token))
    assert response.status_code == 200, response.text
    return response.json()


def test_empty_user_dashboard_matches_contract(harness: Harness, user: dict) -> None:
    token = user["token"]
    assert get(harness, token, "metrics") == {"totalEntries": 0, "tokensUsed": 0, "activeTime": "0min", "messagesExchanged": 0, "streak": 0}
    days = get(harness, token, "activity-heatmap")["days"]
    assert len(days) == 90 and all(day["count"] == 0 for day in days)
    assert days[-1]["date"] == datetime.now(UTC).date().isoformat()
    assert len(get(harness, token, "token-usage?period=7d")["points"]) == 7
    assert len(get(harness, token, "token-usage?period=30d")["points"]) == 30
    assert len(get(harness, token, "token-usage?period=qualquer")["points"]) == 7
    assert len(get(harness, token, "token-usage")["points"]) == 7
    assert get(harness, token, "entries-by-tag") == {"tags": []}


def test_dashboard_reflects_activity(harness: Harness, user: dict) -> None:
    headers = harness.auth(user["token"])
    for title, tags in (("Combate", ["gameplay", "combate"]), ("Pulo", ["gameplay"]), ("Menu", ["ui"])):
        harness.client.post("/api/devlog/entries", headers=headers, json={"title": title, "content": "Conteúdo suficiente aqui.", "tags": tags})
    harness.client.post("/api/chat/send", headers=headers, json={"message": "oi"})

    metrics = get(harness, user["token"], "metrics")
    assert metrics["totalEntries"] == 3 and metrics["tokensUsed"] == 16 and metrics["messagesExchanged"] == 2
    assert metrics["streak"] == 1 and metrics["activeTime"] == "5min"
    assert get(harness, user["token"], "activity-heatmap")["days"][-1]["count"] == 3
    assert get(harness, user["token"], "token-usage")["points"][-1]["tokens"] == 16
    assert get(harness, user["token"], "entries-by-tag")["tags"] == [
        {"tag": "gameplay", "count": 2}, {"tag": "combate", "count": 1}, {"tag": "ui", "count": 1},
    ]


def test_token_balance(harness: Harness, user: dict) -> None:
    before = get(harness, user["token"], "token-balance")
    assert set(before) == {"balance", "limit", "used", "periodStart", "periodEnd"}
    assert before["limit"] == before["balance"] == 100_000 and before["used"] == 0
    start, end = current_period()
    assert before["periodStart"] == start.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    assert before["periodEnd"] == end.isoformat(timespec="milliseconds").replace("+00:00", "Z")

    harness.client.post("/api/chat/send", headers=harness.auth(user["token"]), json={"message": "oi"})
    after = get(harness, user["token"], "token-balance")
    assert after["used"] == 16 and after["balance"] == 100_000 - 16


def test_usage_from_previous_month_does_not_count_against_balance(harness: Harness, user: dict) -> None:
    harness.client.post("/api/chat/send", headers=harness.auth(user["token"]), json={"message": "oi"})
    harness.sql("UPDATE token_usage SET created_at = created_at - interval '40 days'")
    assert get(harness, user["token"], "token-balance")["used"] == 0
    assert get(harness, user["token"], "metrics")["tokensUsed"] == 16  # total histórico continua


def test_streak_and_active_time_helpers() -> None:
    today = date(2026, 11, 12)
    assert compute_streak(set(), today) == 0
    assert compute_streak({today, today - timedelta(days=1), today - timedelta(days=3)}, today) == 2
    assert compute_streak({today - timedelta(days=1), today - timedelta(days=2)}, today) == 2  # hoje ainda sem atividade
    assert compute_streak({today - timedelta(days=2)}, today) == 0
    assert format_active_time(0) == "0min"
    assert format_active_time(59 * 60) == "59min"
    assert format_active_time(5 * 3600 + 26 * 60) == "5h 26min"


def test_current_period_handles_december() -> None:
    start, end = current_period(datetime(2026, 12, 31, 23, 0, tzinfo=UTC))
    assert (start, end) == (datetime(2026, 12, 1, tzinfo=UTC), datetime(2027, 1, 1, tzinfo=UTC))
