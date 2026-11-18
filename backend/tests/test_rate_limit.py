"""S2 (IP do cliente atrás de proxy), S4 (limpeza dos limites) e limites compartilhados em Redis."""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.rate_limit import MemoryRateLimiter, RedisRateLimiter, resolve_client_ip
from tests.conftest import TEST_REDIS_URL, Harness, build_harness, make_settings

PROXY = "10.0.0.5"


# --- resolve_client_ip -----------------------------------------------------------------------------------

@pytest.mark.parametrize("peer, forwarded, trusted, expected", [
    # Sem proxies confiáveis, X-Forwarded-For é ignorado (mesmo forjado).
    ("203.0.113.9", ["1.2.3.4"], (), "203.0.113.9"),
    # Conexão direta de um cliente que NÃO é proxy: cabeçalho ignorado.
    ("203.0.113.9", ["1.2.3.4"], (PROXY,), "203.0.113.9"),
    # Proxy confiável acrescentou o IP real no fim; o valor forjado à esquerda é ignorado.
    (PROXY, ["6.6.6.6, 198.51.100.7"], (PROXY,), "198.51.100.7"),
    # Cadeia de proxies confiáveis (rede CIDR): pula todos e para no primeiro não confiável.
    (PROXY, ["198.51.100.7, 10.0.0.9"], ("10.0.0.0/24",), "198.51.100.7"),
    # Cabeçalho repetido conta como uma lista só.
    (PROXY, ["6.6.6.6", "198.51.100.7"], (PROXY,), "198.51.100.7"),
    # IPv6 e porta.
    (PROXY, ["[2001:db8::1]:4711"], (PROXY,), "2001:db8::1"),
    (PROXY, ["198.51.100.7:4711"], (PROXY,), "198.51.100.7"),
    # Valor inválido no lugar do IP real: não confia em nada à esquerda.
    (PROXY, ["198.51.100.7, lixo"], (PROXY,), PROXY),
    # Proxy confiável sem cabeçalho: o próprio proxy.
    (PROXY, [], (PROXY,), PROXY),
])
def test_resolve_client_ip(peer: str, forwarded: list[str], trusted: tuple[str, ...], expected: str) -> None:
    assert resolve_client_ip(peer, forwarded, trusted) == expected


def test_settings_reject_unsafe_proxy_config() -> None:
    with pytest.raises(ValueError, match="0.0.0.0/0"):
        make_settings(trusted_proxies=["0.0.0.0/0"])
    with pytest.raises(ValueError, match="CIDR"):
        make_settings(trusted_proxies=["proxy.interno"])
    with pytest.raises(ValueError, match="TRUSTED_PROXIES"):
        make_settings(trust_proxy_headers=True)
    with pytest.raises(ValueError, match="REDIS_URL"):
        make_settings(environment="production", cookie_secure=True, redis_url=None)
    assert make_settings(trusted_proxies="10.0.0.5, 10.1.0.0/16").trusted_proxies == ["10.0.0.5", "10.1.0.0/16"]


# --- Pela API ---------------------------------------------------------------------------------------------

def _login(harness: Harness, email: str, forwarded: str | None = None) -> int:
    headers = {"X-Forwarded-For": forwarded} if forwarded else {}
    return harness.client.post("/api/auth/login", json={"email": email, "password": "senha-errada-1"}, headers=headers).status_code


def test_forged_forwarded_for_does_not_bypass_ip_limit() -> None:
    """Reproduz o S2: antes, um X-Forwarded-For diferente a cada tentativa zerava o limite por IP."""
    for harness in build_harness(make_settings(rate_limit_enabled=True), peer="203.0.113.9"):
        statuses = [_login(harness, f"x{i}@patchnotes.dev", forwarded=f"10.9.{i}.{i}") for i in range(21)]
        assert statuses[:20] == [401] * 20 and statuses[20] == 429


def test_trusted_proxy_separates_real_clients() -> None:
    """Atrás do proxy confiável, clientes diferentes não compartilham o mesmo balde (sem bloqueio global)."""
    for harness in build_harness(make_settings(rate_limit_enabled=True, trusted_proxies=[PROXY]), peer=PROXY):
        # Cliente A esgota o próprio limite, inclusive forjando valores à esquerda.
        statuses = [_login(harness, f"a{i}@patchnotes.dev", forwarded=f"6.6.6.{i}, 198.51.100.1") for i in range(21)]
        assert statuses[20] == 429
        # Cliente B, atrás do mesmo proxy, continua livre.
        assert _login(harness, "b@patchnotes.dev", forwarded="198.51.100.2") == 401


def test_login_failures_from_attacker_do_not_lock_out_victim() -> None:
    for harness in build_harness(make_settings(rate_limit_enabled=True, trusted_proxies=[PROXY]), peer=PROXY):
        harness.register(email="vitima@patchnotes.dev", password="senha-da-vitima-1")
        attacker = [_login(harness, "vitima@patchnotes.dev", forwarded="198.51.100.66") for _ in range(11)]
        assert attacker[:10] == [401] * 10 and attacker[10] == 429
        ok = harness.client.post(
            "/api/auth/login", json={"email": "vitima@patchnotes.dev", "password": "senha-da-vitima-1"},
            headers={"X-Forwarded-For": "198.51.100.10"},
        )
        assert ok.status_code == 200


def test_successful_logins_do_not_count_as_failures() -> None:
    for harness in build_harness(make_settings(rate_limit_enabled=True)):
        harness.register(email="ok@patchnotes.dev", password="senha-certa-123")
        statuses = [
            harness.client.post("/api/auth/login", json={"email": "ok@patchnotes.dev", "password": "senha-certa-123"}).status_code
            for _ in range(15)
        ]
        assert statuses == [200] * 15


class _BrokenLimiter:
    async def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        raise RedisConnectionError("down")

    async def count(self, key: str, window_seconds: float) -> int:
        raise RedisConnectionError("down")

    async def record(self, key: str, window_seconds: float) -> None:
        raise RedisConnectionError("down")

    async def aclose(self) -> None:
        pass


def test_limits_fail_closed_when_store_is_down() -> None:
    from app.main import create_app
    from fastapi.testclient import TestClient

    from tests.conftest import ORIGIN, FakeLLM, FakeMailer

    app = create_app(make_settings(rate_limit_enabled=True), llm=FakeLLM(), mailer=FakeMailer(), rate_limiter=_BrokenLimiter())
    with TestClient(app, headers={"Origin": ORIGIN}) as client:
        response = client.post("/api/auth/login", json={"email": "x@patchnotes.dev", "password": "senha-errada-1"})
    assert response.status_code == 503
    assert response.json() == {"message": "Serviço temporariamente indisponível. Tente novamente em instantes."}


# --- MemoryRateLimiter (S4) -------------------------------------------------------------------------------

class _Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_memory_limiter_prunes_each_bucket_by_its_own_window() -> None:
    """Antes, a limpeza usava a janela da chamada atual (60 s) e apagava baldes de 1 h antes da hora."""
    clock = _Clock()
    limiter = MemoryRateLimiter(clock)

    async def scenario() -> None:
        assert await limiter.allow("register:ip", 1, 3600)
        for step in range(200):  # muita atividade de janela curta, 2 min depois
            clock.now = 120 + step
            await limiter.allow(f"chat:{step}", 5, 60)
        assert not await limiter.allow("register:ip", 1, 3600), "o limite de 1 h não pode ser zerado pela limpeza"
        clock.now = 3600 + 400
        await limiter.allow("outra", 5, 60)
        assert await limiter.allow("register:ip", 1, 3600)

    asyncio.run(scenario())


def test_memory_limiter_cleanup_is_incremental_and_bounded() -> None:
    clock = _Clock()
    limiter = MemoryRateLimiter(clock)

    async def scenario() -> None:
        for index in range(1000):
            await limiter.allow(f"k{index}", 5, 60)
        clock.now = 120  # todas expiraram
        await limiter.allow("nova", 5, 60)
        assert 1000 - 64 <= len(limiter) <= 1000, "cada chamada limpa no máximo um lote, nunca o dicionário inteiro"
        for _ in range(20):
            await limiter.allow("nova", 5, 60)
        assert len(limiter) == 1

    asyncio.run(scenario())


# --- RedisRateLimiter -------------------------------------------------------------------------------------

needs_redis = pytest.mark.skipif(not TEST_REDIS_URL, reason="TEST_REDIS_URL não definido")


async def _redis() -> AsyncIterator[Redis]:
    redis = Redis.from_url(TEST_REDIS_URL or "")
    await redis.flushdb()
    try:
        yield redis
    finally:
        await redis.flushdb()
        await redis.aclose()


def _run(test: Any) -> None:
    async def wrapper() -> None:
        async for redis in _redis():
            await test(redis)

    asyncio.run(wrapper())


@needs_redis
def test_redis_limiter_is_atomic_and_shared_between_replicas() -> None:
    async def test(redis: Redis) -> None:
        replica_a, replica_b = RedisRateLimiter(redis), RedisRateLimiter(redis)
        results = await asyncio.gather(*[(replica_a if i % 2 else replica_b).allow("login-ip:1.2.3.4", 10, 60) for i in range(50)])
        assert results.count(True) == 10, "50 tentativas simultâneas em duas réplicas: exatamente 10 passam"
        assert await replica_b.count("login-ip:1.2.3.4", 60) == 10

    _run(test)


@needs_redis
def test_redis_limiter_keys_expire_with_their_window() -> None:
    async def test(redis: Redis) -> None:
        limiter = RedisRateLimiter(redis)
        await limiter.allow("register:1.2.3.4", 10, 3600)
        await limiter.record("login-fail:abc", 300)
        assert 3590_000 < await redis.pttl("patchnotes:rl:register:1.2.3.4") <= 3600_000
        assert 290_000 < await redis.pttl("patchnotes:rl:login-fail:abc") <= 300_000
        assert await limiter.allow("curta", 1, 0.2)
        assert not await limiter.allow("curta", 1, 0.2)
        await asyncio.sleep(0.3)
        assert await limiter.allow("curta", 1, 0.2)
        assert await redis.exists("patchnotes:rl:inexistente") == 0

    _run(test)


@needs_redis
def test_api_uses_redis_and_stores_no_raw_email() -> None:
    async def flush() -> None:
        redis = Redis.from_url(TEST_REDIS_URL or "")
        await redis.flushdb()
        await redis.aclose()

    asyncio.run(flush())
    for harness in build_harness(make_settings(rate_limit_enabled=True, redis_url=TEST_REDIS_URL)):
        assert _login(harness, "privado@patchnotes.dev") == 401

        async def keys() -> list[bytes]:
            return [key async for key in harness.client.app.state.redis.scan_iter("patchnotes:rl:*")]  # type: ignore[attr-defined]

        stored = b" ".join(harness.run(keys))
        assert b"login-ip" in stored and b"login-fail" in stored
        assert b"privado" not in stored, "e-mail vai só como resumo SHA-256"
        harness.run(harness.client.app.state.redis.flushdb)  # type: ignore[attr-defined]
