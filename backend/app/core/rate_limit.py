"""Limites de requisição (janela deslizante) e identificação do IP do cliente.

Dois backends com a mesma interface:
- ``RedisRateLimiter``: estado compartilhado entre processos/réplicas (obrigatório em production). Cada chave
  tem TTL igual à própria janela, então o Redis descarta sozinho o que expirou — nada de varredura na requisição.
- ``MemoryRateLimiter``: um processo só (desenvolvimento e testes). Cada balde guarda a própria janela e a
  limpeza é incremental (no máximo ``_PRUNE_BATCH`` chaves por chamada), nunca uma varredura do dicionário inteiro.
"""

import hashlib
import ipaddress
import logging
import time
import uuid
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable, Iterable
from functools import lru_cache
from typing import Protocol

from fastapi import Request
from redis.asyncio import Redis
from starlette.requests import HTTPConnection
from redis.exceptions import RedisError

from app.core.errors import ApiError

RATE_LIMIT_MESSAGE = "Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente."
LIMITS_UNAVAILABLE_MESSAGE = "Serviço temporariamente indisponível. Tente novamente em instantes."
logger = logging.getLogger("patchnotes.rate_limit")
_KEY_PREFIX = "patchnotes:rl:"
_PRUNE_BATCH = 64

IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


class RateLimiter(Protocol):
    async def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        """Registra uma tentativa se ainda couber na janela. Retorna False (sem registrar) quando o limite foi atingido."""

    async def count(self, key: str, window_seconds: float) -> int:
        """Tentativas registradas na janela atual (não registra nada)."""

    async def record(self, key: str, window_seconds: float) -> None:
        """Registra uma ocorrência sem checar limite (ex.: contar só falhas de login)."""

    async def aclose(self) -> None: ...


# --- Memória (um processo) -------------------------------------------------------------------------------

class MemoryRateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        # chave -> (janela, horários). OrderedDict em ordem de último uso: as chaves mais antigas ficam na frente.
        self._buckets: OrderedDict[str, tuple[float, deque[float]]] = OrderedDict()
        self._clock = clock

    def _bucket(self, key: str, window_seconds: float, now: float) -> deque[float]:
        self._prune(now)
        _, hits = self._buckets.get(key, (window_seconds, deque()))
        while hits and now - hits[0] >= window_seconds:
            hits.popleft()
        self._buckets[key] = (window_seconds, hits)
        self._buckets.move_to_end(key)
        return hits

    def _prune(self, now: float) -> None:
        """Remove até _PRUNE_BATCH baldes expirados, cada um pela SUA janela (não pela da chamada atual)."""
        for _ in range(min(_PRUNE_BATCH, len(self._buckets))):
            key, (window, hits) = next(iter(self._buckets.items()))
            if hits and now - hits[-1] < window:
                break  # o mais antigo ainda está ativo
            del self._buckets[key]

    async def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        now = self._clock()
        hits = self._bucket(key, window_seconds, now)
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True

    async def count(self, key: str, window_seconds: float) -> int:
        return len(self._bucket(key, window_seconds, self._clock()))

    async def record(self, key: str, window_seconds: float) -> None:
        now = self._clock()
        self._bucket(key, window_seconds, now).append(now)

    def __len__(self) -> int:
        return len(self._buckets)

    async def aclose(self) -> None:
        self._buckets.clear()


# --- Redis (várias réplicas) -----------------------------------------------------------------------------

# Relógio do próprio Redis (TIME): réplicas com relógios diferentes contam a mesma janela.
_NOW_MS = "local t = redis.call('TIME'); local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n"
_ALLOW = _NOW_MS + """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - tonumber(ARGV[2]))
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 0
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
"""
_COUNT = _NOW_MS + """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - tonumber(ARGV[1]))
return redis.call('ZCARD', KEYS[1])
"""
_RECORD = _NOW_MS + """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - tonumber(ARGV[1]))
redis.call('ZADD', KEYS[1], now, ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1
"""


class RedisRateLimiter:
    """Janela deslizante num ZSET por chave; cada operação é um script Lua atômico."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._allow = redis.register_script(_ALLOW)
        self._count = redis.register_script(_COUNT)
        self._record = redis.register_script(_RECORD)

    async def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        result = await self._allow(keys=[_KEY_PREFIX + key], args=[limit, _ms(window_seconds), uuid.uuid4().hex])
        return bool(int(result))

    async def count(self, key: str, window_seconds: float) -> int:
        return int(await self._count(keys=[_KEY_PREFIX + key], args=[_ms(window_seconds)]))

    async def record(self, key: str, window_seconds: float) -> None:
        await self._record(keys=[_KEY_PREFIX + key], args=[_ms(window_seconds), uuid.uuid4().hex])

    async def aclose(self) -> None:
        """O cliente Redis é compartilhado e fechado no ciclo de vida da aplicação."""


def _ms(seconds: float) -> int:
    return max(1, int(seconds * 1000))


# --- Chaves e IP do cliente ------------------------------------------------------------------------------

def identifier_key(value: str) -> str:
    """Chave para identificadores pessoais (e-mail): só um resumo vai para o armazenamento de limites."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


@lru_cache(maxsize=16)
def parse_networks(values: tuple[str, ...]) -> tuple[IPNetwork, ...]:
    return tuple(ipaddress.ip_network(value, strict=False) for value in values)


def _parse_ip(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    value = value.strip()
    if value.startswith("[") and "]" in value:  # [IPv6]:porta
        value = value[1:value.index("]")]
    elif value.count(":") == 1:  # IPv4:porta
        value = value.split(":", 1)[0]
    try:
        return ipaddress.ip_address(value)
    except ValueError:
        return None


def _trusted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address | None, networks: Iterable[IPNetwork]) -> bool:
    return ip is not None and any(ip in network for network in networks)


def resolve_client_ip(peer: str | None, forwarded_for: list[str], trusted_proxies: tuple[str, ...]) -> str:
    """IP do cliente. Só lê X-Forwarded-For se a conexão veio de um proxy listado em TRUSTED_PROXIES.

    O cabeçalho é percorrido da DIREITA para a esquerda (cada proxy acrescenta o endereço que viu no fim) e
    o primeiro endereço que não é proxy confiável é o cliente. Valores à esquerda podem ter sido forjados pelo
    próprio cliente e nunca são usados enquanto houver um endereço não confiável mais à direita.
    """
    peer = peer or "unknown"
    networks = parse_networks(trusted_proxies)
    if not networks or not _trusted(_parse_ip(peer), networks):
        return peer
    hops = [hop for header in forwarded_for for hop in header.split(",") if hop.strip()]
    for hop in reversed(hops):
        ip = _parse_ip(hop)
        if ip is None:
            return peer  # proxy mal configurado: não confia em nada à esquerda
        if not _trusted(ip, networks):
            return str(ip)
    return peer


def client_ip(connection: HTTPConnection) -> str:
    """IP do cliente de uma requisição HTTP ou conexão WebSocket."""
    settings = connection.app.state.settings
    return resolve_client_ip(
        connection.client.host if connection.client else None,
        connection.headers.getlist("x-forwarded-for"),
        tuple(settings.trusted_proxies),
    )


# --- Uso nas rotas ---------------------------------------------------------------------------------------

def _limiter(request: Request) -> RateLimiter | None:
    if not request.app.state.settings.rate_limit_enabled:
        return None
    limiter: RateLimiter = request.app.state.rate_limiter
    return limiter


async def _guarded[T](operation: Awaitable[T]) -> T:
    """Falha FECHADA: sem o armazenamento dos limites, a requisição é recusada (503) em vez de seguir sem limite."""
    try:
        return await operation
    except RedisError as error:
        logger.error("Armazenamento de limites indisponível: %s", type(error).__name__)
        raise ApiError(503, LIMITS_UNAVAILABLE_MESSAGE) from error


async def enforce(request: Request, scope: str, key: str, limit: int, window_seconds: float) -> None:
    limiter = _limiter(request)
    if limiter is not None and not await _guarded(limiter.allow(f"{scope}:{key}", limit, window_seconds)):
        raise ApiError(429, RATE_LIMIT_MESSAGE)


async def ensure_below(request: Request, scope: str, key: str, limit: int, window_seconds: float) -> None:
    """429 se as ocorrências já registradas (ex.: falhas) atingiram o limite. Não registra nada."""
    limiter = _limiter(request)
    if limiter is not None and await _guarded(limiter.count(f"{scope}:{key}", window_seconds)) >= limit:
        raise ApiError(429, RATE_LIMIT_MESSAGE)


async def record(request: Request, scope: str, key: str, window_seconds: float) -> None:
    limiter = _limiter(request)
    if limiter is not None:
        await _guarded(limiter.record(f"{scope}:{key}", window_seconds))


def limit_by_ip(scope: str, limit: int, window_seconds: float) -> Callable[[Request], Awaitable[None]]:
    """Dependência FastAPI que limita por IP do cliente."""

    async def dependency(request: Request) -> None:
        await enforce(request, scope, client_ip(request), limit, window_seconds)

    return dependency

