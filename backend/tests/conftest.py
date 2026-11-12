"""Infra de testes: PostgreSQL real (TEST_DATABASE_URL), migrations aplicadas do zero e LLM/e-mail falsos."""

import asyncio
import subprocess
import sys
from collections.abc import AsyncGenerator, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text

from app.core.config import Settings
from app.main import create_app
from app.services.llm_service import LLMError, LLMMessage, StreamEnd, TokenChunk

BACKEND_DIR = Path(__file__).resolve().parent.parent


class _TestEnv(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")
    test_database_url: str


TEST_DATABASE_URL = _TestEnv().test_database_url  # type: ignore[call-arg]
assert "test" in TEST_DATABASE_URL.rsplit("/", 1)[-1], "TEST_DATABASE_URL precisa apontar para um banco de testes"

TABLES = ["token_usage", "chat_messages", "devlog_entries", "password_reset_tokens", "refresh_tokens", "users"]
ORIGIN = "http://localhost:3000"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "environment": "test",
        "database_url": TEST_DATABASE_URL,
        "jwt_secret": SecretStr("segredo-de-teste-com-mais-de-32-caracteres"),
        "cors_origins": [ORIGIN],
        "rate_limit_enabled": False,
        "monthly_token_quota": 100_000,
        "ws_auth_timeout_seconds": 1,
        "ollama_model": "modelo-falso",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Recria o esquema pelas migrations (também testa downgrade/upgrade)."""
    for command in (["downgrade", "base"], ["upgrade", "head"]):
        subprocess.run(
            [sys.executable, "-m", "alembic", "-x", f"db_url={TEST_DATABASE_URL}", *command],
            cwd=BACKEND_DIR, check=True, capture_output=True,
        )


@dataclass
class FakeLLM:
    """LLM programável: chunks, contagens, erro, atraso entre tokens e registro de observações."""

    model: str = "modelo-falso"
    chunks: list[str] = field(default_factory=lambda: ["Olá", ", ", "dev", "!"])
    prompt_tokens: int | None = 12
    completion_tokens: int | None = 4
    error: Exception | None = None
    error_after: int = 0
    delay: float = 0
    calls: list[list[LLMMessage]] = field(default_factory=list)
    on_stream: Any = None
    closed: bool = False

    async def stream(self, messages: list[LLMMessage]) -> AsyncGenerator[TokenChunk | StreamEnd]:
        self.calls.append(messages)
        if self.on_stream is not None:
            self.on_stream()
        for index, chunk in enumerate(self.chunks):
            if self.error is not None and index == self.error_after:
                raise self.error
            if self.delay:
                await asyncio.sleep(self.delay)
            yield TokenChunk(chunk)
        if self.error is not None and self.error_after >= len(self.chunks):
            raise self.error
        yield StreamEnd(self.prompt_tokens, self.completion_tokens)

    async def aclose(self) -> None:
        self.closed = True


@dataclass
class FakeMailer:
    sent: list[dict[str, str]] = field(default_factory=list)

    async def send(self, *, to: str, subject: str, body: str) -> None:
        self.sent.append({"to": to, "subject": subject, "body": body})


@dataclass
class Harness:
    client: TestClient
    llm: FakeLLM
    mailer: FakeMailer
    settings: Settings

    def run(self, coroutine_fn: Any, *args: Any) -> Any:
        """Executa uma corrotina no event loop da aplicação (mesmo engine/pool)."""
        return self.client.portal.call(coroutine_fn, *args)  # type: ignore[union-attr]

    def sql(self, statement: str, **params: Any) -> list[Any]:
        async def go() -> list[Any]:
            async with self.client.app.state.engine.begin() as connection:  # type: ignore[attr-defined]
                result = await connection.execute(text(statement), params)
                return list(result.fetchall()) if result.returns_rows else []

        return self.run(go)

    # --- atalhos de API ---
    def register(self, email: str = "pessoa@patchnotes.dev", password: str = "senha-segura-1", name: str = "Pessoa Teste") -> dict[str, Any]:
        response = self.client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
        assert response.status_code == 201, response.text
        return response.json()

    def auth(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}


def build_harness(settings: Settings, llm: FakeLLM | None = None) -> Iterator[Harness]:
    llm = llm or FakeLLM()
    mailer = FakeMailer()
    app = create_app(settings, llm=llm, mailer=mailer)
    with TestClient(app, headers={"Origin": ORIGIN}) as client:
        harness = Harness(client, llm, mailer, settings)
        harness.sql(f"TRUNCATE {', '.join(TABLES)} CASCADE")
        yield harness


@pytest.fixture
def harness() -> Iterator[Harness]:
    yield from build_harness(make_settings())


@pytest.fixture
def user(harness: Harness) -> dict[str, Any]:
    return harness.register()
