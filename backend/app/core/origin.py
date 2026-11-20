"""Defesa contra CSRF nas requisições autenticadas por cookie (além do SameSite=Strict dos cookies)."""

from starlette.requests import HTTPConnection

from app.core.config import Settings
from app.core.errors import ApiError

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def ensure_trusted_origin(connection: HTTPConnection, settings: Settings) -> None:
    """403 se a requisição vier de outro site. Navegadores sempre mandam Origin em POST/PATCH/DELETE e
    Sec-Fetch-Site nas versões atuais; clientes fora do navegador (sem esses cabeçalhos) não carregam cookies
    de terceiros, então não há o que forjar."""
    origin = connection.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in settings.cors_origins and not _same_origin(connection, origin):
        raise ApiError(403, "Origem não autorizada.")
    if connection.headers.get("sec-fetch-site") == "cross-site":
        raise ApiError(403, "Origem não autorizada.")


def _same_origin(connection: HTTPConnection, origin: str) -> bool:
    """A própria API (ex.: o Swagger em /docs) não é outro site."""
    host = connection.headers.get("host")
    return host is not None and origin.rstrip("/").split("://", 1)[-1] == host
