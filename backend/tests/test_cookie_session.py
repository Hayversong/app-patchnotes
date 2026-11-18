"""Sessão do navegador por cookie HttpOnly: uso, CSRF e WebSocket."""

from tests.conftest import ORIGIN, Harness
from tests.test_ws_chat import collect_reply

EVIL = "https://evil.example"


def use_cookie(harness: Harness, token: str) -> None:
    harness.client.cookies.set(harness.settings.access_cookie_name, token, path="/")


def test_cookie_authenticates_reads_and_writes_from_the_frontend(harness: Harness, user: dict) -> None:
    use_cookie(harness, user["token"])
    assert harness.client.get("/api/auth/me").json() == {"user": user["user"]}
    created = harness.client.post("/api/devlog/entries", json={"title": "Pelo cookie", "content": "Conteúdo suficiente aqui."})
    assert created.status_code == 201


def test_cookie_writes_from_another_site_are_blocked(harness: Harness, user: dict) -> None:
    use_cookie(harness, user["token"])
    payload = {"title": "CSRF", "content": "Conteúdo suficiente aqui."}
    for headers in ({"Origin": EVIL}, {"Origin": ORIGIN, "Sec-Fetch-Site": "cross-site"}):
        assert harness.client.post("/api/devlog/entries", json=payload, headers=headers).status_code == 403
        assert harness.client.post("/api/tokens/recharge", json={"amount": 10_000}, headers=headers).status_code == 403
        assert harness.client.patch("/api/profile", json={"name": "Hacker"}, headers=headers).status_code == 403
    assert harness.sql("SELECT count(*) FROM devlog_entries")[0][0] == 0
    assert harness.sql("SELECT count(*) FROM token_credits")[0][0] == 0


def test_same_origin_swagger_is_not_treated_as_another_site(harness: Harness, user: dict) -> None:
    use_cookie(harness, user["token"])
    response = harness.client.post("/api/devlog/entries", json={"title": "Pelo Swagger", "content": "Conteúdo suficiente aqui."},
                                   headers={"Origin": "http://testserver", "Host": "testserver"})
    assert response.status_code == 201


def test_login_from_another_site_is_blocked(harness: Harness, user: dict) -> None:
    """Login CSRF: um site alheio não pode logar a vítima numa conta controlada por ele."""
    response = harness.client.post("/api/auth/login", json={"email": "pessoa@patchnotes.dev", "password": "senha-segura-1"}, headers={"Origin": EVIL})
    assert response.status_code == 403
    assert "set-cookie" not in response.headers


def test_logout_clears_both_cookies(harness: Harness, user: dict) -> None:
    harness.client.post("/api/auth/login", json={"email": "pessoa@patchnotes.dev", "password": "senha-segura-1"})
    response = harness.client.post("/api/auth/logout")
    cleared = [value.lower() for value in response.headers.get_list("set-cookie")]
    assert any(value.startswith("patchnotes_access=") and "max-age=0" in value for value in cleared)
    assert any(value.startswith("patchnotes_refresh=") and "max-age=0" in value for value in cleared)
    assert harness.client.get("/api/auth/me").status_code == 401


def test_websocket_authenticates_with_the_handshake_cookie(harness: Harness, user: dict) -> None:
    use_cookie(harness, user["token"])
    with harness.client.websocket_connect("/ws/chat", headers={"Origin": ORIGIN}) as ws:
        ws.send_json({"type": "auth"})
        assert ws.receive_json() == {"type": "ready"}
        ws.send_json({"type": "message", "message": "oi"})
        tokens, done = collect_reply(ws)
        assert tokens and done["message"]["role"] == "assistant"


def test_websocket_from_another_site_is_refused_even_with_cookie(harness: Harness, user: dict) -> None:
    use_cookie(harness, user["token"])
    try:
        with harness.client.websocket_connect("/ws/chat", headers={"Origin": EVIL}) as ws:
            ws.send_json({"type": "auth"})
            ws.receive_json()
        raise AssertionError("o handshake deveria ter sido recusado")
    except Exception as error:  # noqa: BLE001 — o TestClient expõe a recusa como exceção
        assert "403" in repr(error) or "WebSocketDisconnect" in type(error).__name__ or "Denial" in type(error).__name__
