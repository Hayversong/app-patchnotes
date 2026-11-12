"""Chat REST: contrato da Parte 1, persistência, contagem de tokens, cota, erros do LLM e ausência de sessão durante a geração."""

from tests.conftest import Harness, build_harness, make_settings
from app.services.llm_service import LLMTimeoutError, LLMUnavailableError


def send(harness: Harness, token: str, message: str = "Como deixar o pulo responsivo?", **extra: str):  # type: ignore[no-untyped-def]
    return harness.client.post("/api/chat/send", headers=harness.auth(token), json={"message": message, **extra})


def test_send_returns_assistant_message_and_persists_history(harness: Harness, user: dict) -> None:
    response = send(harness, user["token"])
    assert response.status_code == 200
    answer = response.json()
    assert set(answer) == {"id", "role", "content", "createdAt", "tokensUsed"}
    assert answer["role"] == "assistant" and answer["content"] == "Olá, dev!" and answer["tokensUsed"] == 4

    history = harness.client.get("/api/chat/history", headers=harness.auth(user["token"])).json()["messages"]
    assert [(m["role"], m["content"]) for m in history] == [("user", "Como deixar o pulo responsivo?"), ("assistant", "Olá, dev!")]
    assert history[0]["tokensUsed"] == 12 and history[1]["id"] == answer["id"]

    [usage] = harness.sql("SELECT prompt_tokens, completion_tokens, total_tokens, estimated, model FROM token_usage")
    assert tuple(usage) == (12, 4, 16, False, "modelo-falso")
    metrics = harness.client.get("/api/dashboard/metrics", headers=harness.auth(user["token"])).json()
    assert metrics["tokensUsed"] == 16 and metrics["messagesExchanged"] == 2


def test_prompt_contains_system_context_and_recent_history(harness: Harness, user: dict) -> None:
    send(harness, user["token"], "primeira")
    send(harness, user["token"], "segunda", context="Jogo de plataforma 2D")
    prompt = harness.llm.calls[-1]
    assert prompt[0].role == "system" and "Jogo de plataforma 2D" in prompt[0].content
    assert [(m.role, m.content) for m in prompt[1:]] == [("user", "primeira"), ("assistant", "Olá, dev!"), ("user", "segunda")]


def test_token_counts_are_estimated_when_model_omits_them(harness: Harness, user: dict) -> None:
    harness.llm.prompt_tokens = None
    harness.llm.completion_tokens = None
    answer = send(harness, user["token"]).json()
    assert answer["tokensUsed"] == 3  # ceil(len("Olá, dev!") / 4)
    [(estimated,)] = harness.sql("SELECT estimated FROM token_usage")
    assert estimated is True


def test_llm_unavailable_returns_503_and_hides_failed_request(harness: Harness, user: dict) -> None:
    harness.llm.error = LLMUnavailableError("conexão recusada em 127.0.0.1:11434")
    response = send(harness, user["token"])
    assert response.status_code == 503
    assert response.json() == {"message": "O assistente está indisponível no momento. Tente novamente em instantes."}
    assert "11434" not in response.text
    assert harness.client.get("/api/chat/history", headers=harness.auth(user["token"])).json() == {"messages": []}
    assert [tuple(row) for row in harness.sql("SELECT role, status FROM chat_messages")] == [("user", "failed")]
    assert harness.sql("SELECT count(*) FROM token_usage")[0][0] == 0


def test_llm_timeout_mid_stream_returns_504(harness: Harness, user: dict) -> None:
    harness.llm.error = LLMTimeoutError("tempo esgotado")
    harness.llm.error_after = 2
    response = send(harness, user["token"])
    assert response.status_code == 504
    assert harness.sql("SELECT status FROM chat_messages")[0][0] == "failed"


def test_empty_model_answer_is_an_error(harness: Harness, user: dict) -> None:
    harness.llm.chunks = ["   "]
    assert send(harness, user["token"]).status_code == 503


def test_message_validation(harness: Harness, user: dict) -> None:
    for message in ("", "x" * 2001):
        response = send(harness, user["token"], message)
        assert response.status_code == 400
        assert "message" in response.json()["details"]["fieldErrors"]
    assert harness.llm.calls == []


def test_quota_exhausted_blocks_chat_with_429() -> None:
    for harness in build_harness(make_settings(monthly_token_quota=20)):
        user = harness.register()
        assert send(harness, user["token"]).status_code == 200  # consome 16
        assert send(harness, user["token"]).status_code == 200  # 16 < 20: ainda permitido; passa a 32
        blocked = send(harness, user["token"])
        assert blocked.status_code == 429
        assert "cota mensal" in blocked.json()["message"]
        assert len(harness.llm.calls) == 2


def test_no_database_connection_is_held_while_llm_generates(harness: Harness, user: dict) -> None:
    observed: list[int] = []
    engine = harness.client.app.state.engine  # type: ignore[attr-defined]
    harness.llm.on_stream = lambda: observed.append(engine.pool.checkedout())
    assert send(harness, user["token"]).status_code == 200
    assert observed == [0]


def test_history_is_isolated_per_user(harness: Harness, user: dict) -> None:
    other = harness.register(email="outra@patchnotes.dev")
    send(harness, user["token"])
    assert harness.client.get("/api/chat/history", headers=harness.auth(other["token"])).json() == {"messages": []}
