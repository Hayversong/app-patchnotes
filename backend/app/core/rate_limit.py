"""Limite de requisições em memória (janela deslizante).

Vale por processo: com vários workers/réplicas, use um armazenamento compartilhado (ex.: Redis).
"""

import time
from collections import deque
from collections.abc import Callable

from fastapi import Request

from app.core.errors import ApiError

RATE_LIMIT_MESSAGE = "Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente."


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._clock = clock

    def hit(self, key: str, limit: int, window_seconds: float) -> bool:
        """Registra uma tentativa; retorna False quando o limite da janela foi atingido."""
        now = self._clock()
        bucket = self._hits.setdefault(key, deque())
        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        if len(self._hits) > 50_000:
            self._prune(now, window_seconds)
        return True

    def _prune(self, now: float, window_seconds: float) -> None:
        for key in [key for key, bucket in self._hits.items() if not bucket or now - bucket[-1] >= window_seconds]:
            del self._hits[key]

    def reset(self) -> None:
        self._hits.clear()


def client_ip(request: Request, trust_proxy_headers: bool) -> str:
    if trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce(request: Request, scope: str, key: str, limit: int, window_seconds: float) -> None:
    settings = request.app.state.settings
    if not settings.rate_limit_enabled:
        return
    limiter: RateLimiter = request.app.state.rate_limiter
    if not limiter.hit(f"{scope}:{key}", limit, window_seconds):
        raise ApiError(429, RATE_LIMIT_MESSAGE)


def limit_by_ip(scope: str, limit: int, window_seconds: float) -> Callable[[Request], None]:
    """Dependência FastAPI que limita por IP do cliente."""

    def dependency(request: Request) -> None:
        enforce(request, scope, client_ip(request, request.app.state.settings.trust_proxy_headers), limit, window_seconds)

    return dependency
