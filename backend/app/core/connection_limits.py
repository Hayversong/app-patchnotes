"""Vagas de conexões simultâneas (WebSocket), por usuário e por IP.

Cada conexão ocupa uma vaga com validade curta (``ttl``), renovada por um heartbeat enquanto ela vive e liberada
ao fechar. Se o processo morrer sem liberar, a vaga expira sozinha: nada fica preso.

- ``RedisConnectionSlots``: compartilhado entre réplicas; ZSET por chave com score = expiração (relógio do Redis),
  operações em scripts Lua atômicos — duas réplicas não conseguem ultrapassar o limite ao mesmo tempo.
- ``MemoryConnectionSlots``: um processo (desenvolvimento e testes). As operações não têm ``await`` no meio,
  então são atômicas no event loop.
"""

import time
import uuid
from collections.abc import Callable
from typing import Protocol

from redis.asyncio import Redis

_KEY_PREFIX = "patchnotes:ws:"


class ConnectionSlots(Protocol):
    async def acquire(self, key: str, limit: int, ttl_seconds: float) -> str | None:
        """Reserva uma vaga e devolve o id dela, ou None se o limite já foi atingido."""

    async def refresh(self, key: str, slot: str, ttl_seconds: float) -> None: ...

    async def release(self, key: str, slot: str) -> None: ...

    async def active(self, key: str) -> int: ...


class MemoryConnectionSlots:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._slots: dict[str, dict[str, float]] = {}
        self._clock = clock

    def _live(self, key: str) -> dict[str, float]:
        now = self._clock()
        slots = {slot: expires for slot, expires in self._slots.get(key, {}).items() if expires > now}
        if slots:
            self._slots[key] = slots
        else:
            self._slots.pop(key, None)
        return slots

    async def acquire(self, key: str, limit: int, ttl_seconds: float) -> str | None:
        slots = self._live(key)
        if len(slots) >= limit:
            return None
        slot = uuid.uuid4().hex
        self._slots[key] = {**slots, slot: self._clock() + ttl_seconds}
        return slot

    async def refresh(self, key: str, slot: str, ttl_seconds: float) -> None:
        slots = self._live(key)
        if slot in slots:
            slots[slot] = self._clock() + ttl_seconds

    async def release(self, key: str, slot: str) -> None:
        slots = self._live(key)
        slots.pop(slot, None)
        if not slots:
            self._slots.pop(key, None)

    async def active(self, key: str) -> int:
        return len(self._live(key))

    def __len__(self) -> int:
        return len(self._slots)


_NOW_MS = "local t = redis.call('TIME'); local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)\n"
_ACQUIRE = _NOW_MS + """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
"""
_REFRESH = _NOW_MS + """
if redis.call('ZADD', KEYS[1], 'XX', 'CH', now + tonumber(ARGV[1]), ARGV[2]) == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return 1
"""
_ACTIVE = _NOW_MS + """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
return redis.call('ZCARD', KEYS[1])
"""


class RedisConnectionSlots:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._acquire = redis.register_script(_ACQUIRE)
        self._refresh = redis.register_script(_REFRESH)
        self._active = redis.register_script(_ACTIVE)

    async def acquire(self, key: str, limit: int, ttl_seconds: float) -> str | None:
        slot = uuid.uuid4().hex
        acquired = await self._acquire(keys=[_KEY_PREFIX + key], args=[limit, _ms(ttl_seconds), slot])
        return slot if int(acquired) else None

    async def refresh(self, key: str, slot: str, ttl_seconds: float) -> None:
        await self._refresh(keys=[_KEY_PREFIX + key], args=[_ms(ttl_seconds), slot])

    async def release(self, key: str, slot: str) -> None:
        await self._redis.zrem(_KEY_PREFIX + key, slot)

    async def active(self, key: str) -> int:
        return int(await self._active(keys=[_KEY_PREFIX + key], args=[]))


def _ms(seconds: float) -> int:
    return max(1, int(seconds * 1000))
