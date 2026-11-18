"""OllamaService contra um transporte HTTP simulado (sem Ollama real)."""

import json
from collections.abc import Callable

import httpx
import pytest

from app.services.llm_service import LLMError, LLMMessage, LLMTimeoutError, LLMUnavailableError, OllamaService, StreamEnd, TokenChunk, estimate_tokens
from tests.conftest import make_settings

PROMPT = [LLMMessage("system", "sistema"), LLMMessage("user", "olá")]


def service(handler: Callable[[httpx.Request], httpx.Response], **settings: object) -> OllamaService:
    config = make_settings(ollama_model="qwen2.5:3b", **settings)
    return OllamaService(config, httpx.AsyncClient(base_url="http://ollama.test", transport=httpx.MockTransport(handler)))


def ndjson(*lines: dict) -> bytes:
    return "\n".join(json.dumps(line) for line in lines).encode() + b"\n"


async def collect(llm: OllamaService) -> list[TokenChunk | StreamEnd]:
    return [event async for event in llm.stream(PROMPT)]


async def test_parses_stream_and_token_counts() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, content=ndjson(
            {"message": {"role": "assistant", "content": "Oi"}, "done": False},
            {"message": {"role": "assistant", "content": " dev"}, "done": False},
            {"message": {"role": "assistant", "content": ""}, "done": True, "prompt_eval_count": 21, "eval_count": 2},
        ))

    events = await collect(service(handler, ollama_max_output_tokens=64, ollama_temperature=0.2))
    assert events == [TokenChunk("Oi"), TokenChunk(" dev"), StreamEnd(21, 2)]
    assert seen["model"] == "qwen2.5:3b" and seen["stream"] is True
    assert seen["options"]["num_predict"] == 64 and seen["options"]["temperature"] == 0.2
    assert seen["messages"] == [{"role": "system", "content": "sistema"}, {"role": "user", "content": "olá"}]


async def test_missing_counts_become_none() -> None:
    events = await collect(service(lambda _: httpx.Response(200, content=ndjson({"message": {"content": "x"}, "done": True}))))
    assert events[-1] == StreamEnd(None, None)


@pytest.mark.parametrize("handler, error", [
    (lambda _: httpx.Response(404, json={"error": "model not found"}), LLMUnavailableError),
    (lambda _: httpx.Response(500, text="boom"), LLMError),
    (lambda _: httpx.Response(200, content=b"isso nao e json\n"), LLMError),
    (lambda _: httpx.Response(200, content=ndjson({"error": "out of memory"})), LLMError),
    (lambda _: httpx.Response(200, content=ndjson({"message": {"content": "sem fim"}, "done": False})), LLMError),
])
async def test_http_and_protocol_errors(handler: Callable[[httpx.Request], httpx.Response], error: type[Exception]) -> None:
    with pytest.raises(error):
        await collect(service(handler))


async def test_connection_refused_is_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(LLMUnavailableError):
        await collect(service(handler))


async def test_read_timeout_is_timeout_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(LLMTimeoutError):
        await collect(service(handler))


async def test_total_timeout_is_enforced() -> None:
    lines = [{"message": {"content": "x"}, "done": False}] * 3 + [{"done": True}]
    with pytest.raises(LLMTimeoutError):
        await collect(service(lambda _: httpx.Response(200, content=ndjson(*lines)), ollama_total_timeout=1e-9))


def test_estimate_tokens() -> None:
    assert estimate_tokens("") == 1
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("abcde") == 2
