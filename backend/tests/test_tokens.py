from app.services.quota_service import RECHARGE_PACKAGES
from tests.conftest import Harness, build_harness, make_settings


def recharge(harness: Harness, token: str, amount: int):
    return harness.client.post("/api/tokens/recharge", headers=harness.auth(token), json={"amount": amount})


def send(harness: Harness, token: str):
    return harness.client.post("/api/chat/send", headers=harness.auth(token), json={"message": "oi"})


def test_tokens_require_authentication(harness: Harness) -> None:
    for method, path in (("get", "/api/tokens/balance"), ("get", "/api/tokens/history"), ("post", "/api/tokens/recharge")):
        assert getattr(harness.client, method)(path).status_code == 401


def test_recharge_adds_credits_to_balance(harness: Harness, user: dict) -> None:
    response = recharge(harness, user["token"], 10_000)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["recharged"] == 10_000 and body["credits"] == 10_000
    assert body["limit"] == body["balance"] == 110_000

    balance = harness.client.get("/api/tokens/balance", headers=harness.auth(user["token"])).json()
    assert balance["balance"] == 110_000 and balance["credits"] == 10_000


def test_recharge_rejects_amount_outside_packages(harness: Harness, user: dict) -> None:
    for amount in (0, -5, 1, 999_999):
        response = recharge(harness, user["token"], amount)
        assert response.status_code == 400
        assert "amount" in response.json()["details"]
    assert harness.sql("SELECT count(*) FROM token_credits")[0][0] == 0


def test_monthly_recharge_cap_returns_429() -> None:
    for harness in build_harness(make_settings(monthly_token_credit_cap=60_000)):
        user = harness.register()
        assert recharge(harness, user["token"], 50_000).status_code == 200
        blocked = recharge(harness, user["token"], 50_000)
        assert blocked.status_code == 429
        assert recharge(harness, user["token"], 10_000).status_code == 200


def test_recharge_unblocks_chat_when_quota_is_exhausted() -> None:
    for harness in build_harness(make_settings(monthly_token_quota=10)):
        user = harness.register()
        assert send(harness, user["token"]).status_code == 200  # consome 16, saldo zera
        assert send(harness, user["token"]).status_code == 429
        assert recharge(harness, user["token"], RECHARGE_PACKAGES[0]).status_code == 200
        assert send(harness, user["token"]).status_code == 200


def test_history_lists_usage_and_recharges_newest_first(harness: Harness, user: dict) -> None:
    assert send(harness, user["token"]).status_code == 200
    assert recharge(harness, user["token"], 50_000).status_code == 200

    body = harness.client.get("/api/tokens/history", headers=harness.auth(user["token"])).json()
    assert body["packages"] == list(RECHARGE_PACKAGES)
    kinds = [item["kind"] for item in body["items"]]
    assert kinds == ["recharge", "usage"]
    usage = body["items"][1]
    assert usage["amount"] == 16 and usage["promptTokens"] + usage["completionTokens"] == 16 and usage["model"]
    assert "model" not in body["items"][0]


def test_history_is_private_per_user(harness: Harness, user: dict) -> None:
    recharge(harness, user["token"], 10_000)
    other = harness.register(email="outra@patchnotes.dev")
    assert harness.client.get("/api/tokens/history", headers=harness.auth(other["token"])).json()["items"] == []


def test_swagger_lists_every_endpoint(harness: Harness) -> None:
    assert harness.client.get("/docs").status_code == 200
    paths = harness.client.get("/openapi.json").json()["paths"]
    for path in ("/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/chat/history", "/api/dashboard/metrics",
                 "/api/tokens/balance", "/api/tokens/history", "/api/tokens/recharge", "/api/devlog/entries", "/api/profile"):
        assert path in paths, path


def test_swagger_is_off_in_production_unless_enabled() -> None:
    assert make_settings(environment="production", jwt_secret="x" * 40, cookie_secure=True, cors_origins=["https://app.dev"], redis_url="redis://r:6379/0").api_docs_enabled is False
    assert make_settings(environment="production", jwt_secret="x" * 40, cookie_secure=True, cors_origins=["https://app.dev"], redis_url="redis://r:6379/0", api_docs=True).api_docs_enabled is True
