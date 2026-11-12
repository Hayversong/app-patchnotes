"""WebSocket /ws/chat: autenticação, streaming token a token, erros e desconexão."""

import json
import time

import pytest
from starlette.websockets import WebSocketDisconnect

from app.services.llm_service import LLMUnavailableError
from tests.conftest import ORIGIN, Harness, build_harness, make_settings


def connect(harness: Harness, origin: str = ORIGIN):  # type: ignore[no-untyped-def]
    return harness.client.websocket_connect("/ws/chat", headers={"Origin": origin})


def authenticate(ws, token: str) -> None:  # type: ignore[no-untyped-def]
    ws.send_json({"type": "auth", "token": token})
    assert ws.receive_json() == {"type": "ready"}


def collect_reply(ws) -> tuple[list[str], dict]:  # type: ignore[no-untyped-def]
    assert ws.receive_json() == {"type": "start"}
    tokens: list[str] = []
    while True:
        event = ws.receive_json()
        if event["type"] == "token":
            tokens.append(event["content"])
            continue
        return tokens, event


def test_streams_tokens_and_final_event(harness: Harness, user: dict) -> None:
    with connect(harness) as ws:
        authenticate(ws, user["token"])
        ws.send_json({"type": "message", "message": "Ideia de mecânica?"})
        tokens, done = collect_reply(ws)
    assert tokens == ["Olá", ", ", "dev", "!"]
    assert done["type"] == "done" and done["done"] is True and done["tokens"] == 4
    assert done["message"]["role"] == "assistant" and done["message"]["content"] == "Olá, dev!"

    history = harness.client.get("/api/chat/history", headers=harness.auth(user["token"])).json()["messages"]
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[1]["id"] == done["message"]["id"]


def test_multiple_messages_on_same_connection(harness: Harness, user: dict) -> None:
    with connect(harness) as ws:
        authenticate(ws, user["token"])
        for text in ("um", "dois"):
            ws.send_json({"type": "message", "message": text})
            assert collect_reply(ws)[1]["type"] == "done"
    assert harness.sql("SELECT count(*) FROM chat_messages WHERE status = 'complete'")[0][0] == 4


@pytest.mark.parametrize("first_frame", [
    {"type": "auth", "token": "invalido"},
    {"type": "message", "message": "sem auth"},
    "não é json",
])
def test_rejects_unauthenticated_connections(harness: Harness, first_frame: object) -> None:
    with connect(harness) as ws:
        ws.send_text(first_frame if isinstance(first_frame, str) else json.dumps(first_frame))
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401
    assert harness.llm.calls == []


def test_auth_timeout_closes_connection(harness: Harness) -> None:
    with connect(harness) as ws:
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401


def test_foreign_origin_is_refused(harness: Harness) -> None:
    with pytest.raises(WebSocketDisconnect) as closed:
        with connect(harness, origin="https://evil.example") as ws:
            ws.receive_json()
    assert closed.value.code == 4403


def test_invalid_messages_keep_connection_open(harness: Harness, user: dict) -> None:
    with connect(harness) as ws:
        authenticate(ws, user["token"])
        ws.send_text("{quebrado")
        assert ws.receive_json()["code"] == "invalid_message"
        ws.send_json({"type": "message", "message": "x" * 2001})
        assert ws.receive_json()["code"] == "invalid_message"
        ws.send_json({"type": "message", "message": ""})
        assert ws.receive_json()["code"] == "invalid_message"
        ws.send_json({"type": "message", "message": "agora válida"})
        assert collect_reply(ws)[1]["type"] == "done"


def test_oversized_frame_closes_with_1009(harness: Harness, user: dict) -> None:
    with connect(harness) as ws:
        authenticate(ws, user["token"])
        ws.send_text("x" * (harness.settings.ws_max_frame_bytes + 1))
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 1009


def test_llm_error_is_reported_and_connection_survives(harness: Harness, user: dict) -> None:
    harness.llm.error = LLMUnavailableError("detalhe interno")
    harness.llm.error_after = 1
    with connect(harness) as ws:
        authenticate(ws, user["token"])
        ws.send_json({"type": "message", "message": "oi"})
        assert ws.receive_json() == {"type": "start"}
        assert ws.receive_json() == {"type": "token", "content": "Olá"}
        error = ws.receive_json()
        assert error["type"] == "error" and error["code"] == "llm_unavailable" and "detalhe interno" not in error["message"]

        harness.llm.error = None
        ws.send_json({"type": "message", "message": "de novo"})
        assert collect_reply(ws)[1]["type"] == "done"
    statuses = sorted(row[0] for row in harness.sql("SELECT status FROM chat_messages WHERE role = 'user'"))
    assert statuses == ["complete", "failed"]


def test_client_disconnect_mid_stream_marks_request_failed(harness: Harness, user: dict) -> None:
    harness.llm.chunks = [f"t{i} " for i in range(40)]
    harness.llm.delay = 0.05
    with connect(harness) as ws:
        authenticate(ws, user["token"])
        ws.send_json({"type": "message", "message": "vou desconectar"})
        assert ws.receive_json() == {"type": "start"}
        assert ws.receive_json()["type"] == "token"
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and harness.sql("SELECT status FROM chat_messages")[0][0] == "pending":
        time.sleep(0.05)
    assert harness.sql("SELECT status FROM chat_messages")[0][0] == "failed"
    assert harness.sql("SELECT count(*) FROM token_usage")[0][0] == 0
    # O servidor segue atendendo normalmente.
    harness.llm.chunks, harness.llm.delay = ["ok"], 0
    assert harness.client.post("/api/chat/send", headers=harness.auth(user["token"]), json={"message": "oi"}).status_code == 200


def test_token_revoked_during_connection_closes_on_next_message(harness: Harness, user: dict) -> None:
    with connect(harness) as ws:
        authenticate(ws, user["token"])
        harness.sql("UPDATE users SET session_version = session_version + 1")
        ws.send_json({"type": "message", "message": "oi"})
        assert ws.receive_json()["code"] == "unauthorized"
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401


def test_quota_exceeded_over_websocket() -> None:
    for harness in build_harness(make_settings(monthly_token_quota=0)):
        user = harness.register()
        with connect(harness) as ws:
            authenticate(ws, user["token"])
            ws.send_json({"type": "message", "message": "oi"})
            assert ws.receive_json() == {"type": "start"}
            error = ws.receive_json()
        assert error["code"] == "quota_exceeded"
        assert harness.llm.calls == []
