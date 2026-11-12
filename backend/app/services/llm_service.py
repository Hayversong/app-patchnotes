"""Cliente do Ollama (POST /api/chat com streaming NDJSON).

Isolado atrás do protocolo `LLMService` para que testes (e outro provedor no futuro) possam substituí-lo.
"""

import json
import math
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import Settings


@dataclass(frozen=True)
class LLMMessage:
    role: str  # system | user | assistant
    content: str


@dataclass(frozen=True)
class TokenChunk:
    content: str


@dataclass(frozen=True)
class StreamEnd:
    """Contagens informadas pelo modelo (None quando ausentes)."""

    prompt_tokens: int | None
    completion_tokens: int | None


class LLMError(Exception):
    code = "llm_error"
    user_message = "O assistente não conseguiu responder agora. Tente novamente em instantes."


class LLMUnavailableError(LLMError):
    code = "llm_unavailable"
    user_message = "O assistente está indisponível no momento. Tente novamente em instantes."


class LLMTimeoutError(LLMError):
    code = "llm_timeout"
    user_message = "O assistente demorou demais para responder. Tente novamente."


class LLMService(Protocol):
    model: str

    def stream(self, messages: list[LLMMessage]) -> AsyncGenerator[TokenChunk | StreamEnd]: ...

    async def aclose(self) -> None: ...


def estimate_tokens(text: str) -> int:
    """Estimativa usada só quando o modelo não informa a contagem: ~4 caracteres por token (mínimo 1)."""
    return max(1, math.ceil(len(text) / 4))


class OllamaService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.model = settings.ollama_model
        self._settings = settings
        self._client = client or httpx.AsyncClient(base_url=settings.ollama_url)
        self._timeout = httpx.Timeout(
            connect=settings.ollama_connect_timeout,
            read=settings.ollama_read_timeout,
            write=10,
            pool=settings.ollama_connect_timeout,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    def _payload(self, messages: list[LLMMessage]) -> dict[str, object]:
        return {
            "model": self.model,
            "messages": [{"role": message.role, "content": message.content} for message in messages],
            "stream": True,
            "keep_alive": self._settings.ollama_keep_alive,
            "options": {
                "temperature": self._settings.ollama_temperature,
                "num_ctx": self._settings.ollama_num_ctx,
                "num_predict": self._settings.ollama_max_output_tokens,
            },
        }

    async def stream(self, messages: list[LLMMessage]) -> AsyncGenerator[TokenChunk | StreamEnd]:
        deadline = time.monotonic() + self._settings.ollama_total_timeout
        try:
            async with self._client.stream("POST", "/api/chat", json=self._payload(messages), timeout=self._timeout) as response:
                if response.status_code == 404:
                    raise LLMUnavailableError(f"modelo '{self.model}' não encontrado no Ollama")
                if response.status_code >= 400:
                    raise LLMError(f"Ollama respondeu HTTP {response.status_code}")
                async for line in response.aiter_lines():
                    if time.monotonic() > deadline:
                        raise LLMTimeoutError("tempo total de geração excedido")
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                    except ValueError as error:
                        raise LLMError("resposta do Ollama não é JSON válido") from error
                    if not isinstance(data, dict):
                        raise LLMError("resposta do Ollama em formato inesperado")
                    if data.get("error"):
                        raise LLMError("Ollama retornou erro durante a geração")
                    message = data.get("message")
                    content = message.get("content") if isinstance(message, dict) else None
                    if isinstance(content, str) and content:
                        yield TokenChunk(content)
                    if data.get("done") is True:
                        yield StreamEnd(_as_count(data.get("prompt_eval_count")), _as_count(data.get("eval_count")))
                        return
                raise LLMError("streaming terminou sem o evento final")
        except httpx.TimeoutException as error:
            raise LLMTimeoutError("tempo limite ao falar com o Ollama") from error
        except httpx.HTTPError as error:
            raise LLMUnavailableError("não foi possível conectar ao Ollama") from error


def _as_count(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None
